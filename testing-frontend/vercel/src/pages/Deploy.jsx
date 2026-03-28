// ─── Deploy.jsx ───────────────────────────────────────────────────────────────
/* eslint-disable */
import { useEffect, useRef, useState } from "react";
import { getAuthHeaders, clearToken } from "../lib/auth";
import { API_BASE } from "../lib/http";
import CodeDeploy from "./Codedeploy";
import DeployPipeline, { sseMessageToNodeId } from "./DeployPipelineRealTime";

// ─── Step labels ──────────────────────────────────────────────────────────────
const STEP_LABELS = [
  { key: "clone", emoji: "📥", label: "Cloning repository" },
  { key: "install", emoji: "📦", label: "Installing dependencies" },
  { key: "build", emoji: "🔨", label: "Building project" },
  { key: "serve", emoji: "🌐", label: "Starting server" },
];

const UPLOAD_STEP_LABELS = [
  { key: "extract", emoji: "📦", label: "Extracting files" },
  { key: "serve", emoji: "🌐", label: "Starting server" },
];

const STEP_KEYWORDS = {
  clone: ["Cloning repository", "cloned"],
  install: ["npm install", "Installing dependencies"],
  build: ["npm run build", "Building project"],
  serve: ["serve", "Starting server"],
};

function matchStep(msg) {
  for (const [key, kws] of Object.entries(STEP_KEYWORDS)) {
    if (kws.some((kw) => msg.toLowerCase().includes(kw.toLowerCase())))
      return key;
  }
  return null;
}

// Which connector idx fires when a node is activated
const CONN_FOR = {
  github: null,
  express: 0,
  nodejs: 1,
  docker: 2,
  npm: 3,
  react: 4,
  mongo: 5,
};

// ─── Shared components ────────────────────────────────────────────────────────

function StepRow({ emoji, label, state }) {
  const st = {
    idle: { dot: "rgba(0,0,0,0.15)", text: "rgba(11,11,15,0.4)", badge: null },
    running: {
      dot: "#f97316",
      text: "#0b0b0f",
      badge: { color: "#f97316", label: "running…" },
    },
    done: {
      dot: "#22c55e",
      text: "#0b0b0f",
      badge: { color: "#22c55e", label: "✓" },
    },
    error: {
      dot: "#ef4444",
      text: "#dc2626",
      badge: { color: "#ef4444", label: "✗ failed" },
    },
  }[state] || {
    dot: "rgba(0,0,0,0.15)",
    text: "rgba(11,11,15,0.4)",
    badge: null,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "7px 0",
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: st.dot,
          boxShadow:
            state === "running" ? "0 0 0 3px rgba(249,115,22,0.2)" : "none",
          flexShrink: 0,
          transition: "all 0.3s",
        }}
      />
      <span style={{ fontSize: 14 }}>{emoji}</span>
      <span
        style={{
          fontSize: 13,
          color: st.text,
          fontFamily: "monospace",
          flex: 1,
        }}
      >
        {label}
      </span>
      {st.badge && (
        <span style={{ fontSize: 11, color: st.badge.color, fontWeight: 700 }}>
          {st.badge.label}
        </span>
      )}
    </div>
  );
}

function TerminalPanel({ logs }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);
  const C = {
    stdout: "#16a34a",
    stderr: "#ea580c",
    system: "#2563eb",
    error: "#dc2626",
  };
  if (!logs.length) return null;
  return (
    <div style={s.termCol}>
      <div style={s.termBar}>
        <div style={{ display: "flex", gap: 6 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div
              key={c}
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: c,
              }}
            />
          ))}
        </div>
        <span style={s.termTitle}>Build output</span>
      </div>
      <div style={s.termBody}>
        {logs.map((log) => (
          <div
            key={log.id}
            style={{ ...s.logLine, color: C[log.type] || "#555" }}
          >
            <span style={s.logBadge}>{log.type}</span>
            {log.message}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

// ─── Tab 1: GitHub Deploy ─────────────────────────────────────────────────────

function GitHubDeploy({ navigate }) {
  const [name, setName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [logs, setLogs] = useState([]);
  const [steps, setSteps] = useState(
    Object.fromEntries(STEP_LABELS.map((s) => [s.key, "idle"]))
  );
  const [deployedUrl, setDeployedUrl] = useState(null);
  const [error, setError] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const activeStepRef = useRef(null);

  // ── Pipeline state ─────────────────────────────────────────────────────────
  // These drive DeployPipeline in "controlled" mode — every SSE event updates them
  const [pNodes, setPNodes] = useState({});
  const [pConns, setPConns] = useState({});
  const [pLogs, setPLogs] = useState([]);
  const [pDone, setPDone] = useState(false);

  function resetState() {
    setLogs([]);
    setSteps(Object.fromEntries(STEP_LABELS.map((s) => [s.key, "idle"])));
    setDeployedUrl(null);
    setError(null);
    activeStepRef.current = null;
    // Reset pipeline
    setPNodes({});
    setPConns({});
    setPLogs([]);
    setPDone(false);
  }

  function markStep(key, state) {
    setSteps((p) => ({ ...p, [key]: state }));
    if (state === "running") activeStepRef.current = key;
    if (state === "done" || state === "error") activeStepRef.current = null;
  }

  function pushLog(type, message) {
    setLogs((p) => [...p, { type, message, id: Date.now() + Math.random() }]);
  }

  // ── Core: drive pipeline from an SSE event ─────────────────────────────────
  // This is the only place that touches pNodes/pConns — keeps it centralized.
  function advancePipeline(eventType, data, nodeId) {
    if (!nodeId) return;

    const isDoneEvent = eventType === "step_done" || eventType === "done";
    const newState = isDoneEvent ? "done" : "running";

    setPNodes((prev) => {
      // Don't downgrade a done node back to running
      if (prev[nodeId] === "done" && newState === "running") return prev;
      return { ...prev, [nodeId]: newState };
    });

    const ci = CONN_FOR[nodeId];
    if (ci != null) {
      setPConns((prev) => ({
        ...prev,
        [ci]: newState === "done" ? "done" : "active",
      }));
    }
  }

  function addPLog(t, m) {
    setPLogs((prev) => [...prev, { t, m, id: Date.now() + Math.random() }]);
  }

  // ── SSE event handler ──────────────────────────────────────────────────────
  function handleSSEEvent(eventType, data) {
    const msg = data?.message || "";

    // 1. Map this event to a pipeline node
    const nodeId = sseMessageToNodeId(eventType, data);

    // 2. Drive the pipeline
    advancePipeline(eventType, data, nodeId);

    // 3. Mirror to the pipeline's own log panel
    if (eventType === "log") {
      if (data.type === "stdout") addPLog("sys", msg);
      if (data.type === "stderr") addPLog("err", msg);
    }
    if (eventType === "step_start") addPLog("sys", `▶ ${msg}`);
    if (eventType === "step_done") addPLog("ok", `✓ ${msg}`);
    if (eventType === "status") addPLog("sys", msg);
    if (eventType === "system") addPLog("sys", msg);

    // 4. Drive the step tracker (existing UI below the form)
    if (eventType === "log") {
      pushLog(data.type, msg);
      const m = matchStep(msg);
      if (m && data.type === "stdout")
        setSteps((p) => {
          if (p[m] === "idle") markStep(m, "running");
          return p;
        });
    }
    if (eventType === "status") {
      if (msg.toLowerCase().includes("cloning")) markStep("clone", "running");
      if (msg.toLowerCase().includes("cloned")) markStep("clone", "done");
      const m = matchStep(msg);
      if (m) markStep(m, "running");
    }
    if (eventType === "step_start") {
      const m = matchStep(msg);
      if (m) markStep(m, "running");
      pushLog("system", msg);
    }
    if (eventType === "step_done") {
      const m = matchStep(msg);
      if (m) markStep(m, "done");
      pushLog("system", msg);
    }

    // 5. Final done / error
    if (eventType === "done") {
      setSteps(Object.fromEntries(STEP_LABELS.map((s) => [s.key, "done"])));
      setDeployedUrl(data.url);
      setDeploying(false);

      // Mark all pipeline nodes done
      const allDone = Object.fromEntries(
        ["github", "express", "nodejs", "docker", "npm", "react", "mongo"].map(
          (id) => [id, "done"]
        )
      );
      setPNodes(allDone);
      setPConns({
        0: "done",
        1: "done",
        2: "done",
        3: "done",
        4: "done",
        5: "done",
      });
      setPDone(true);
      addPLog("ok", `🚀 Live → ${data.url}`);

      setTimeout(() => navigate("/dashboard"), 2000);
    }

    if (eventType === "error") {
      if (activeStepRef.current) markStep(activeStepRef.current, "error");
      // Mark currently running pipeline node as error
      setPNodes((prev) => {
        const runningId = Object.entries(prev).find(
          ([, v]) => v === "running"
        )?.[0];
        return runningId ? { ...prev, [runningId]: "error" } : prev;
      });
      setError(msg);
      setDeploying(false);
      addPLog("err", msg);
    }
  }

  // ── Deploy ─────────────────────────────────────────────────────────────────
  async function deploy() {
    if (!name.trim() || !githubUrl.trim() || deploying) return;
    resetState();
    setDeploying(true);
    markStep("clone", "running");

    // Bootstrap: github → express fire immediately on click (before SSE starts)
    setPNodes({ github: "running" });
    addPLog("sys", `POST /api/projects/create`);

    // github done + express running after a short delay
    setTimeout(() => {
      setPNodes((p) => ({ ...p, github: "done", express: "running" }));
      setPConns((p) => ({ ...p, 0: "done" }));
      addPLog("ok", "Request received");
    }, 300);

    // express done + mongo running (mongo fires from express, parallel to nodejs)
    setTimeout(() => {
      setPNodes((p) => ({ ...p, express: "done", mongo: "running" }));
      setPConns((p) => ({ ...p, 1: "active", 5: "active" }));
      addPLog("ok", "JWT verified — auth OK");
      addPLog("sys", "Saving project to MongoDB…");
    }, 700);

    // mongo done
    setTimeout(() => {
      setPNodes((p) => ({ ...p, mongo: "done" }));
      setPConns((p) => ({ ...p, 5: "done" }));
      addPLog("ok", "Project document created");
    }, 1100);

    try {
      const response = await fetch(`${API_BASE}/api/projects/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ name, githubUrl }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          clearToken();
          navigate("/login");
          return;
        }
        throw new Error(
          (await response.text().catch(() => "")) || `Error ${response.status}`
        );
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          let evt = "message",
            dat = null;
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
      setError(err?.message || "Connection error");
      setDeploying(false);
      addPLog("err", err?.message || "Connection error");
    }
  }

  const showPanel = deploying || deployedUrl || error || logs.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Pipeline — full width, synced to real SSE events */}
      <DeployPipeline
        externalNodeStates={pNodes}
        externalConnStates={pConns}
        externalLogs={pLogs}
        externalDone={pDone}
        externalRunning={deploying}
      />

      {/* Form + terminal */}
      <div style={s.twoCol}>
        <div style={s.formCol}>
          <div style={s.fieldGroup}>
            <div style={s.field}>
              <label style={s.label}>Project name</label>
              <input
                style={s.input}
                placeholder="my-app"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={deploying}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>GitHub URL</label>
              <input
                style={s.input}
                placeholder="https://github.com/user/repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                disabled={deploying}
              />
            </div>
            <button
              style={deploying ? s.deployBtnBusy : s.deployBtn}
              onClick={deploy}
              disabled={deploying}
            >
              {deploying ? "Deploying…" : "Deploy →"}
            </button>
          </div>

          {showPanel && (
            <div style={s.stepsCard}>
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

          {deployedUrl && (
            <div style={s.successCard}>
              <div style={s.successTitle}>🚀 Deployed!</div>
              <a
                href={deployedUrl}
                target="_blank"
                rel="noreferrer"
                style={s.successLink}
              >
                {deployedUrl}
              </a>
              <div style={s.successHint}>Redirecting to dashboard…</div>
            </div>
          )}
          {error && <div style={s.errorCard}>⚠ {error}</div>}
        </div>

        <TerminalPanel logs={logs} />
      </div>
    </div>
  );
}

// ─── Tab 2: Upload Deploy ─────────────────────────────────────────────────────

function UploadDeploy({ navigate }) {
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState([]);
  const [steps, setSteps] = useState(
    Object.fromEntries(UPLOAD_STEP_LABELS.map((s) => [s.key, "idle"]))
  );
  const [deployedUrl, setDeployedUrl] = useState(null);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const inputZipRef = useRef();
  const inputFolderRef = useRef();

  function resetState() {
    setLogs([]);
    setStatus("idle");
    setDeployedUrl(null);
    setError(null);
    setSteps(
      Object.fromEntries(UPLOAD_STEP_LABELS.map((s) => [s.key, "idle"]))
    );
  }
  function markStep(key, state) {
    setSteps((p) => ({ ...p, [key]: state }));
  }
  function pushLog(type, message) {
    setLogs((p) => [...p, { type, message, id: Date.now() + Math.random() }]);
  }

  async function deployFiles(file, files) {
    resetState();
    setStatus("uploading");
    markStep("extract", "running");
    pushLog("system", "📤 Uploading build files…");
    const form = new FormData();
    form.append(
      "name",
      name || (file ? file.name.replace(".zip", "") : "upload")
    );
    if (file) {
      form.append("build", file);
    } else {
      const relativePaths = [];
      for (const f of files) {
        form.append("files", f);
        relativePaths.push(f.webkitRelativePath || f.name);
      }
      form.append("relativePaths", JSON.stringify(relativePaths));
    }
    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: form,
      });
      if (!res.ok) {
        if (res.status === 401) {
          clearToken();
          navigate("/login");
          return;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `Error ${res.status}`);
      }
      const data = await res.json();
      markStep("extract", "done");
      markStep("serve", "done");
      if (data.logs?.length) for (const l of data.logs) pushLog(l.type, l.msg);
      pushLog("system", `🚀 Live → ${data.url}`);
      setDeployedUrl(data.url);
      setStatus("done");
      setTimeout(() => navigate("/dashboard"), 1400);
    } catch (err) {
      markStep("extract", "error");
      setError(err.message);
      setStatus("error");
      pushLog("error", err.message);
    }
  }

  function handleZipFile(file) {
    if (!file) return;
    if (!file.name.endsWith(".zip")) {
      setError("Please select a .zip file");
      return;
    }
    setSelectedFile(file);
    setSelectedFiles([]);
    deployFiles(file, null);
  }
  function handleFolderFiles(files) {
    if (!files?.length) return;
    setSelectedFiles(Array.from(files));
    setSelectedFile(null);
    deployFiles(null, Array.from(files));
  }
  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const dtFiles = Array.from(e.dataTransfer.files);
    if (dtFiles.length === 1 && dtFiles[0].name.endsWith(".zip")) {
      handleZipFile(dtFiles[0]);
      return;
    }
    if (dtFiles.length > 1) {
      handleFolderFiles(dtFiles);
      return;
    }
    handleZipFile(e.dataTransfer.files?.[0]);
  }

  const uploading = status === "uploading";
  const fileLabel = selectedFile
    ? `📦 ${selectedFile.name}`
    : selectedFiles.length
    ? `📁 ${selectedFiles.length} files`
    : null;

  return (
    <div style={s.twoCol}>
      <div style={s.formCol}>
        <div style={s.fieldGroup}>
          <div style={s.field}>
            <label style={s.label}>Project name</label>
            <input
              style={s.input}
              placeholder="my-app"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={uploading}
            />
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            style={{
              ...s.dropZone,
              borderColor: dragging
                ? "#f97316"
                : uploading
                ? "#22c55e"
                : "rgba(0,0,0,0.15)",
              background: dragging
                ? "rgba(249,115,22,0.04)"
                : uploading
                ? "rgba(34,197,94,0.04)"
                : "#fafaf9",
            }}
          >
            {uploading ? (
              <>
                <div style={s.dropIcon}>⏳</div>
                <div style={s.dropTitle}>Deploying…</div>
                <div style={s.dropSub}>Uploading and starting container</div>
              </>
            ) : status === "done" ? (
              <>
                <div style={s.dropIcon}>✅</div>
                <div style={s.dropTitle}>Deployed!</div>
              </>
            ) : (
              <>
                <div style={s.dropIcon}>{dragging ? "📂" : "📦"}</div>
                <div style={s.dropTitle}>
                  {dragging ? "Drop it!" : fileLabel || "Drop your build here"}
                </div>
                <div style={s.dropSub}>
                  {fileLabel
                    ? "Drop again to replace"
                    : "Accepts a .zip or dist/ files"}
                </div>
                <div style={s.dropButtons}>
                  <button
                    style={s.dropBtn}
                    onClick={() => inputZipRef.current.click()}
                    disabled={uploading}
                  >
                    📦 Upload ZIP
                  </button>
                  <button
                    style={s.dropBtn}
                    onClick={() => inputFolderRef.current.click()}
                    disabled={uploading}
                  >
                    📁 Upload Folder
                  </button>
                </div>
              </>
            )}
            <input
              ref={inputZipRef}
              type="file"
              accept=".zip"
              style={{ display: "none" }}
              onChange={(e) => handleZipFile(e.target.files?.[0])}
            />
            <input
              ref={inputFolderRef}
              type="file"
              multiple
              style={{ display: "none" }}
              webkitdirectory="true"
              directory="true"
              onChange={(e) => handleFolderFiles(e.target.files)}
            />
          </div>
          <div style={s.uploadHint}>
            <span style={{ color: "#f97316", fontWeight: 700 }}>Tip:</span> Run{" "}
            <code style={s.code}>npm run build</code> locally, then zip your{" "}
            <code style={s.code}>dist/</code> folder.
          </div>
        </div>
        {(uploading || status === "done" || status === "error") && (
          <div style={s.stepsCard}>
            {UPLOAD_STEP_LABELS.map((step) => (
              <StepRow
                key={step.key}
                emoji={step.emoji}
                label={step.label}
                state={steps[step.key]}
              />
            ))}
          </div>
        )}
        {deployedUrl && (
          <div style={s.successCard}>
            <div style={s.successTitle}>🚀 Deployed!</div>
            <a
              href={deployedUrl}
              target="_blank"
              rel="noreferrer"
              style={s.successLink}
            >
              {deployedUrl}
            </a>
            <div style={s.successHint}>Redirecting…</div>
          </div>
        )}
        {error && <div style={s.errorCard}>⚠ {error}</div>}
      </div>
      <TerminalPanel logs={logs} />
    </div>
  );
}

// ─── Main Deploy page ─────────────────────────────────────────────────────────

export default function Deploy({ navigate }) {
  const [tab, setTab] = useState("github");

  useEffect(() => {
    if (!getAuthHeaders().Authorization) navigate("/login");
  }, []);

  if (tab === "code")
    return <CodeDeploy navigate={navigate} onBack={() => setTab("github")} />;

  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        input:focus { outline: none; border-color: #f97316 !important; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 4px; }
        .tab-btn:hover { background: rgba(249,115,22,0.06) !important; }
      `}</style>

      <header style={s.topBar}>
        <div style={s.brand}>
          <span style={s.brandMark}>▲</span>
          <span style={s.brandText}>VERCELITE</span>
        </div>
        <button style={s.backBtn} onClick={() => navigate("/dashboard")}>
          ← Dashboard
        </button>
      </header>

      <div style={s.wrap}>
        <div style={s.pageHead}>
          <h1 style={s.heading}>New deployment</h1>
          <p style={s.sub}>Deploy from GitHub or upload a pre-built project.</p>
        </div>

        <div style={s.tabRow}>
          {[
            {
              key: "github",
              icon: "🐙",
              label: "GitHub",
              desc: "Clone & build from repo",
            },
            {
              key: "upload",
              icon: "📦",
              label: "Upload Build",
              desc: "Drop dist/ zip or files",
            },
            {
              key: "code",
              icon: "💻",
              label: "Code & Deploy",
              desc: "Write React, deploy live",
            },
          ].map(({ key, icon, label, desc }) => (
            <button
              key={key}
              className="tab-btn"
              style={tab === key ? s.tabActive : s.tab}
              onClick={() => setTab(key)}
            >
              <span style={s.tabIcon}>{icon}</span>
              <div>
                <div style={s.tabLabel}>{label}</div>
                <div style={s.tabDesc}>{desc}</div>
              </div>
              {tab === key && <div style={s.tabPill}>Selected</div>}
            </button>
          ))}
        </div>

        {tab === "github" && <GitHubDeploy navigate={navigate} />}
        {tab === "upload" && <UploadDeploy navigate={navigate} />}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const FONT = "'DM Sans', system-ui, sans-serif";
const s = {
  page: {
    minHeight: "100vh",
    background: "#f0ede6",
    fontFamily: FONT,
    color: "#0b0b0f",
  },
  topBar: {
    height: 64,
    background: "#fff",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  brandMark: { fontSize: 16, fontWeight: 900 },
  brandText: { fontSize: 14, fontWeight: 900, letterSpacing: 2 },
  backBtn: {
    padding: "9px 16px",
    background: "transparent",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: FONT,
  },
  wrap: { maxWidth: 1100, margin: "0 auto", padding: "36px 24px" },
  pageHead: { marginBottom: 24 },
  heading: {
    fontSize: 30,
    fontWeight: 900,
    letterSpacing: "-0.03em",
    marginBottom: 6,
  },
  sub: { fontSize: 14, color: "rgba(11,11,15,0.55)" },
  tabRow: { display: "flex", gap: 12, marginBottom: 28 },
  tab: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "16px 20px",
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    cursor: "pointer",
    fontFamily: FONT,
    textAlign: "left",
  },
  tabActive: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "16px 20px",
    background: "#fff",
    border: "1.5px solid #f97316",
    borderRadius: 16,
    cursor: "pointer",
    fontFamily: FONT,
    textAlign: "left",
    boxShadow: "0 4px 16px rgba(249,115,22,0.12)",
  },
  tabIcon: { fontSize: 24, flexShrink: 0 },
  tabLabel: {
    fontSize: 14,
    fontWeight: 900,
    color: "#0b0b0f",
    marginBottom: 2,
  },
  tabDesc: { fontSize: 12, color: "rgba(11,11,15,0.5)", fontWeight: 500 },
  tabPill: {
    marginLeft: "auto",
    fontSize: 10,
    fontWeight: 900,
    color: "#f97316",
    background: "rgba(249,115,22,0.1)",
    padding: "4px 10px",
    borderRadius: 999,
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  twoCol: { display: "flex", gap: 24, alignItems: "flex-start" },
  formCol: { width: 380, flexShrink: 0 },
  fieldGroup: {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1,
    color: "rgba(11,11,15,0.5)",
    textTransform: "uppercase",
  },
  input: {
    padding: "11px 14px",
    background: "#f0ede6",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 12,
    fontSize: 14,
    color: "#0b0b0f",
    fontFamily: FONT,
    transition: "border-color 0.2s",
  },
  deployBtn: {
    padding: "14px",
    background: "#f97316",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: FONT,
    letterSpacing: 0.5,
  },
  deployBtnBusy: {
    padding: "14px",
    background: "#f97316",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontWeight: 900,
    fontSize: 13,
    cursor: "not-allowed",
    opacity: 0.55,
    fontFamily: FONT,
  },
  dropZone: {
    border: "2px dashed",
    borderRadius: 14,
    padding: "32px 20px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  dropIcon: { fontSize: 32, marginBottom: 4 },
  dropTitle: { fontSize: 14, fontWeight: 900, color: "#0b0b0f" },
  dropSub: { fontSize: 12, color: "rgba(11,11,15,0.5)", lineHeight: 1.5 },
  dropButtons: { display: "flex", gap: 8, marginTop: 8 },
  dropBtn: {
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 700,
    background: "#f0ede6",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: FONT,
  },
  uploadHint: {
    fontSize: 12,
    color: "rgba(11,11,15,0.55)",
    lineHeight: 1.6,
    background: "#f0ede6",
    borderRadius: 10,
    padding: "10px 12px",
  },
  code: {
    fontFamily: "monospace",
    background: "rgba(0,0,0,0.07)",
    padding: "1px 5px",
    borderRadius: 4,
    fontSize: 11,
  },
  stepsCard: {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    padding: "14px 18px",
    marginBottom: 16,
  },
  successCard: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 16,
    padding: "18px 20px",
  },
  successTitle: { fontWeight: 900, fontSize: 15, marginBottom: 6 },
  successLink: {
    fontSize: 13,
    color: "#15803d",
    fontWeight: 700,
    wordBreak: "break-all",
  },
  successHint: { fontSize: 12, color: "rgba(11,11,15,0.4)", marginTop: 8 },
  errorCard: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 16,
    padding: "16px 20px",
    color: "#dc2626",
    fontSize: 13,
  },
  termCol: {
    flex: 1,
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 20,
    overflow: "hidden",
    minWidth: 0,
    position: "sticky",
    top: 80,
  },
  termBar: {
    background: "#f0ede6",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  termTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(11,11,15,0.45)",
    letterSpacing: 0.8,
  },
  termBody: {
    padding: "16px",
    maxHeight: "calc(100vh - 180px)",
    overflowY: "auto",
  },
  logLine: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 1.8,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  logBadge: {
    display: "inline-block",
    marginRight: 8,
    opacity: 0.4,
    fontSize: 10,
    minWidth: 40,
  },
};
