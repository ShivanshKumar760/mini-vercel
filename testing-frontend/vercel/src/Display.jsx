import { useState, useRef, useEffect } from "react";

// ── Types emitted by docker.service.js ───────────────────────────────────────
// system     → lifecycle messages
// step_start → a named step is beginning
// step_done  → a named step finished
// stdout     → raw stdout
// stderr     → raw stderr

const STEP_LABELS = [
  { key: "clone", emoji: "📥", label: "Cloning repository" },
  {
    key: "install",
    emoji: "📦",
    label: "Installing dependencies (npm install)",
  },
  { key: "build", emoji: "🔨", label: "Building project (npm run build)" },
  { key: "serve", emoji: "🌐", label: "Starting server (serve -s dist)" },
];

const STEP_KEYWORD_MAP = {
  clone: ["Cloning repository", "cloned"],
  install: ["npm install", "Installing dependencies"],
  build: ["npm run build", "Building project"],
  serve: ["serve", "Starting server"],
};

function matchStep(message) {
  for (const [key, keywords] of Object.entries(STEP_KEYWORD_MAP)) {
    if (
      keywords.some((kw) => message.toLowerCase().includes(kw.toLowerCase()))
    ) {
      return key;
    }
  }
  return null;
}

// ── Step indicator component ──────────────────────────────────────────────────
function StepRow({ emoji, label, state }) {
  const colors = {
    idle: { dot: "#3a3a4a", text: "#666" },
    running: { dot: "#f9c846", text: "#eee" },
    done: { dot: "#3fb950", text: "#eee" },
    error: { dot: "#f85149", text: "#f85149" },
  };
  const c = colors[state] || colors.idle;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "6px 0",
      }}
    >
      {/* Animated ring when running */}
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: c.dot,
          boxShadow:
            state === "running" ? `0 0 0 3px rgba(249,200,70,0.25)` : "none",
          transition: "all 0.3s",
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 15 }}>{emoji}</span>
      <span style={{ fontSize: 13, color: c.text, fontFamily: "monospace" }}>
        {label}
      </span>
      {state === "running" && (
        <span
          style={{
            fontSize: 11,
            color: "#f9c846",
            marginLeft: "auto",
            animation: "pulse 1s infinite",
          }}
        >
          running…
        </span>
      )}
      {state === "done" && (
        <span style={{ fontSize: 11, color: "#3fb950", marginLeft: "auto" }}>
          ✓
        </span>
      )}
      {state === "error" && (
        <span style={{ fontSize: 11, color: "#f85149", marginLeft: "auto" }}>
          ✗ failed
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DeployPanel() {
  const [name, setName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [logs, setLogs] = useState([]); // { type, message }[]
  const [steps, setSteps] = useState(
    // track per-step state
    Object.fromEntries(STEP_LABELS.map((s) => [s.key, "idle"]))
  );
  const [activeStep, setActiveStep] = useState(null);
  const [deployedUrl, setDeployedUrl] = useState(null);
  const [error, setError] = useState(null);
  const [deploying, setDeploying] = useState(false);

  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function resetState() {
    setLogs([]);
    setSteps(Object.fromEntries(STEP_LABELS.map((s) => [s.key, "idle"])));
    setActiveStep(null);
    setDeployedUrl(null);
    setError(null);
  }

  function markStep(key, state) {
    setSteps((prev) => ({ ...prev, [key]: state }));
    if (state === "running") setActiveStep(key);
    if (state === "done" || state === "error") setActiveStep(null);
  }

  function pushLog(type, message) {
    setLogs((prev) => [
      ...prev,
      { type, message, id: Date.now() + Math.random() },
    ]);
  }

  function handleSSEEvent(event, data) {
    if (event === "log") {
      pushLog(data.type, data.message);

      // Auto-detect which step is running from the message content
      const matched = matchStep(data.message);
      if (matched && data.type === "stdout") {
        setSteps((prev) => {
          if (prev[matched] === "idle") {
            markStep(matched, "running");
          }
          return prev;
        });
      }
    }

    if (event === "status") {
      const matched = matchStep(data.message);
      if (data.message.toLowerCase().includes("cloning"))
        markStep("clone", "running");
      if (data.message.toLowerCase().includes("cloned"))
        markStep("clone", "done");
      if (matched) markStep(matched, "running");
    }

    if (event === "step_start") {
      const matched = matchStep(data.message);
      if (matched) markStep(matched, "running");
      pushLog("system", data.message);
    }

    if (event === "step_done") {
      const matched = matchStep(data.message);
      if (matched) markStep(matched, "done");
      pushLog("system", data.message);
    }

    if (event === "done") {
      // Mark remaining steps done
      setSteps(Object.fromEntries(STEP_LABELS.map((s) => [s.key, "done"])));
      setDeployedUrl(data.url);
      setDeploying(false);
    }

    if (event === "error") {
      if (activeStep) markStep(activeStep, "error");
      setError(data.message);
      setDeploying(false);
    }
  }

  async function deploy() {
    if (!name.trim() || !githubUrl.trim() || deploying) return;
    resetState();
    setDeploying(true);

    // Mark clone as first running step
    markStep("clone", "running");

    try {
      const response = await fetch(
        "http://localhost:5000/api/projects/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, githubUrl }),
        }
      );

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop(); // hold incomplete chunk

        for (const part of parts) {
          let evt = "message";
          let dat = null;
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) evt = line.slice(7).trim();
            if (line.startsWith("data: ")) {
              try {
                dat = JSON.parse(line.slice(6));
              } catch {
                dat = { message: line.slice(6) };
              }
            }
          }
          if (dat) handleSSEEvent(evt, dat);
        }
      }
    } catch (err) {
      setError("Connection error: " + err.message);
      setDeploying(false);
    }
  }

  const logColor = { stdout: "#a8d8a8", stderr: "#f4a261", system: "#74b9ff" };

  return (
    <div style={s.page}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
      `}</style>

      <div style={s.card}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.logo}>▲</span>
          <span style={s.title}>Mini Vercel</span>
        </div>

        {/* Inputs */}
        <div style={s.form}>
          <input
            style={s.input}
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={deploying}
          />
          <input
            style={s.input}
            placeholder="https://github.com/user/repo"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            disabled={deploying}
          />
          <button
            style={{ ...s.btn, ...(deploying ? s.btnDisabled : {}) }}
            onClick={deploy}
            disabled={deploying}
          >
            {deploying ? "Deploying…" : "Deploy →"}
          </button>
        </div>

        {/* Step progress */}
        {(deploying || deployedUrl || error) && (
          <div style={s.stepsBox}>
            {STEP_LABELS.map((step) => (
              <StepRow
                key={step.key}
                emoji={step.emoji}
                label={step.label}
                state={steps[step.key]}
              />
            ))}
          </div>
        )}

        {/* Live log terminal */}
        {logs.length > 0 && (
          <div style={s.terminal}>
            <div style={s.termBar}>
              <span style={s.dot("#ff5f57")} />
              <span style={s.dot("#febc2e")} />
              <span style={s.dot("#28c840")} />
              <span style={s.termTitle}>Build Output</span>
            </div>
            <div style={s.logBody}>
              {logs.map((log) => (
                <div
                  key={log.id}
                  style={{ ...s.logLine, color: logColor[log.type] || "#ccc" }}
                >
                  <span style={s.logBadge}>{log.type}</span>
                  {log.message}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Success banner */}
        {deployedUrl && (
          <div style={s.success}>
            🚀 Deployed!{" "}
            <a
              href={deployedUrl}
              target="_blank"
              rel="noreferrer"
              style={s.link}
            >
              {deployedUrl}
            </a>
          </div>
        )}

        {/* Error banner */}
        {error && <div style={s.errorBox}>❌ {error}</div>}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  page: {
    minHeight: "100vh",
    background: "#010409",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Fira Code', 'Courier New', monospace",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 780,
    background: "#0d1117",
    border: "1px solid #21262d",
    borderRadius: 12,
    padding: 32,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
  },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 28 },
  logo: { fontSize: 24, color: "#fff" },
  title: { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: -0.5 },
  form: { display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" },
  input: {
    flex: 1,
    minWidth: 200,
    padding: "10px 14px",
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#e6edf3",
    fontSize: 13,
    outline: "none",
  },
  btn: {
    padding: "10px 22px",
    background: "#238636",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.3,
    transition: "opacity 0.2s",
  },
  btnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  stepsBox: {
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 8,
    padding: "14px 18px",
    marginBottom: 18,
  },
  terminal: {
    background: "#010409",
    border: "1px solid #21262d",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 18,
  },
  termBar: {
    background: "#161b22",
    padding: "8px 14px",
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderBottom: "1px solid #21262d",
  },
  dot: (color) => ({
    display: "inline-block",
    width: 11,
    height: 11,
    borderRadius: "50%",
    background: color,
  }),
  termTitle: { marginLeft: 8, fontSize: 11, color: "#8b949e" },
  logBody: { padding: "12px 16px", maxHeight: 380, overflowY: "auto" },
  logLine: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 1.75,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  logBadge: {
    display: "inline-block",
    marginRight: 8,
    opacity: 0.45,
    fontSize: 10,
    minWidth: 42,
  },
  success: {
    background: "#0f2d1a",
    border: "1px solid #238636",
    borderRadius: 8,
    padding: "14px 18px",
    color: "#3fb950",
    fontSize: 13,
  },
  errorBox: {
    background: "#2d0f0f",
    border: "1px solid #f85149",
    borderRadius: 8,
    padding: "14px 18px",
    color: "#f85149",
    fontSize: 13,
  },
  link: { color: "#58a6ff", textDecoration: "none" },
};
