/* eslint-disable*/
import { useEffect, useRef, useState } from "react";

function DeployAnimation() {
  const [step, setStep] = useState(-1);
  const [logs, setLogs] = useState([]);
  const [typedName, setTypedName] = useState("");
  const [typedUrl, setTypedUrl] = useState("");
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);
  const logsRef = useRef(null);

  const NODES = [
    { id: "react", label: "React UI", color: "#61dafb" },
    { id: "express", label: "Express", color: "#888" },
    { id: "nodejs", label: "Node.js", color: "#3c873a" },
    { id: "docker", label: "Docker", color: "#2396ed" },
    { id: "npm", label: "npm build", color: "#cb3837" },
    { id: "live", label: "Live 🚀", color: "#22c55e" },
  ];

  const LOGS = [
    { t: "system", m: "📥 Cloning github.com/alice/my-blog…" },
    { t: "stdout", m: "Receiving objects: 100% (142/142)" },
    { t: "system", m: "🐳 Container started — a3f7c1d2b4e9" },
    { t: "stdout", m: "added 287 packages in 14.3s" },
    { t: "system", m: "🔨 Building (vite build)…" },
    { t: "stdout", m: "✓ 214 modules transformed." },
    { t: "system", m: "🌐 Serving → http://localhost:3000" },
    { t: "system", m: "🚀 Live → http://my-blog.localhost:3472" },
  ];

  // Map step index → which logs to show
  const STEP_LOGS = [[], [], [0, 1], [2], [3, 4, 5], [6, 7]];

  async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function typeInto(setter, text, speed = 55) {
    setter("");
    for (let i = 0; i <= text.length; i++) {
      setter(text.slice(0, i));
      await sleep(speed + Math.random() * 25);
    }
  }

  async function run() {
    if (running) return;
    setRunning(true);
    setStep(-1);
    setLogs([]);
    setTypedName("");
    setTypedUrl("");
    setDone(false);

    await sleep(500);
    setStep(0); // React UI active
    await typeInto(setTypedName, "my-blog", 80);
    await sleep(300);
    await typeInto(setTypedUrl, "https://github.com/alice/my-blog", 35);
    await sleep(500);

    for (let i = 1; i < NODES.length; i++) {
      setStep(i);
      const newLogs = STEP_LOGS[i] || [];
      for (const idx of newLogs) {
        await sleep(350);
        setLogs((prev) => [...prev.slice(-7), LOGS[idx]]);
      }
      await sleep(600);
    }

    setDone(true);
    setRunning(false);
  }

  useEffect(() => {
    run();
  }, []);
  useEffect(() => {
    if (logsRef.current)
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const ICON_URLS = {
    react:
      "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg",
    express:
      "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/express/express-original.svg",
    nodejs:
      "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg",
    docker:
      "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/docker/docker-original.svg",
    npm: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/npm/npm-original-wordmark.svg",
  };

  const logColor = { stdout: "#16a34a", stderr: "#ea580c", system: "#2563eb" };

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 20,
        overflow: "hidden",
      }}
    >
      {/* Form */}
      <div style={{ padding: 24, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={ss.label}>Project name</div>
            <div style={ss.fakeInput}>
              {typedName}
              <span style={ss.cursor} />
            </div>
          </div>
          <div style={{ flex: 2 }}>
            <div style={ss.label}>GitHub URL</div>
            <div style={ss.fakeInput}>
              {typedUrl}
              <span style={step < 1 ? ss.cursor : { display: "none" }} />
            </div>
          </div>
          <button
            style={{ ...ss.btn, opacity: step >= 1 ? 1 : 0.4, marginTop: 18 }}
            onClick={run}
            disabled={running}
          >
            {running ? "Deploying…" : "Deploy →"}
          </button>
        </div>
      </div>

      {/* Pipeline nodes */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 24px",
          gap: 0,
        }}
      >
        {NODES.map((node, i) => {
          const active = step === i;
          const done2 = step > i;
          return (
            <div
              key={node.id}
              style={{ display: "flex", alignItems: "center" }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: done2
                      ? "2px solid #22c55e"
                      : active
                      ? "2px solid #f97316"
                      : "1px solid rgba(0,0,0,0.1)",
                    boxShadow: active
                      ? "0 0 0 4px rgba(249,115,22,0.15)"
                      : done2
                      ? "0 0 0 4px rgba(34,197,94,0.1)"
                      : "none",
                    background:
                      node.id === "live" ? "rgba(34,197,94,0.07)" : "#fafaf9",
                    transition: "all 0.4s",
                    transform: active ? "scale(1.1)" : "scale(1)",
                  }}
                >
                  {node.id === "live" ? (
                    <span style={{ fontSize: 22 }}>🚀</span>
                  ) : (
                    <img
                      src={ICON_URLS[node.id]}
                      style={{ width: 28, height: 28 }}
                      alt={node.label}
                    />
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: active || done2 ? "#0b0b0f" : "rgba(11,11,15,0.4)",
                    textAlign: "center",
                    maxWidth: 60,
                    lineHeight: 1.3,
                  }}
                >
                  {node.label}
                </div>
              </div>
              {i < NODES.length - 1 && (
                <div
                  style={{
                    width: 32,
                    height: 2,
                    background: step > i ? "#f97316" : "rgba(0,0,0,0.08)",
                    transition: "background .5s",
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Log panel */}
      <div
        ref={logsRef}
        style={{
          background: "#0b0b0f",
          padding: "12px 16px",
          minHeight: 100,
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        {logs.map((l, i) => (
          <div
            key={i}
            style={{ color: logColor[l.t] || "#888", lineHeight: 1.8 }}
          >
            <span style={{ opacity: 0.4, fontSize: 10, marginRight: 8 }}>
              {l.t}
            </span>
            {l.m}
          </div>
        ))}
      </div>

      {/* Success bar */}
      {done && (
        <div
          style={{
            background: "#f0fdf4",
            borderTop: "1px solid #bbf7d0",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 14, color: "#15803d" }}>
            ✅ Deployed →{" "}
            <span style={{ fontWeight: 700 }}>
              http://my-blog.localhost:3472
            </span>
          </div>
          <button style={ss.btn} onClick={run}>
            ↺ Replay
          </button>
        </div>
      )}
    </div>
  );
}

const ss = {
  label: {
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 1,
    color: "rgba(11,11,15,0.45)",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  fakeInput: {
    padding: "9px 12px",
    background: "#f0ede6",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 10,
    fontSize: 13,
    minHeight: 36,
    fontFamily: "'DM Sans',sans-serif",
  },
  cursor: {
    display: "inline-block",
    width: 1,
    height: 12,
    background: "#0b0b0f",
    marginLeft: 1,
    verticalAlign: "middle",
    animation: "blink .8s step-end infinite",
  },
  btn: {
    padding: "9px 16px",
    background: "#f97316",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'DM Sans',sans-serif",
    whiteSpace: "nowrap",
  },
};

export default DeployAnimation;
