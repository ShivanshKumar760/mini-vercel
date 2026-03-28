import { useCallback, useEffect, useRef, useState } from "react";

// ─── Tech Stack Icons ─────────────────────────────────────────────────────────
// CDN: https://cdn.jsdelivr.net/gh/tandpfun/skill-icons@main/icons/<Name>.svg
// Full list: https://skillicons.dev

const ICON_BASE = "https://cdn.jsdelivr.net/gh/tandpfun/skill-icons@main/icons";

function TechIcon({ name, size = 36 }) {
  return (
    <img
      src={`${ICON_BASE}/${name}.svg`}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: "contain", display: "block", pointerEvents: "none" }}
    />
  );
}

// ─── Node definitions ─────────────────────────────────────────────────────────

const NODES = [
  {
    id: "github",
    label: "GitHub",
    icon: "Github-Dark",
    info: "User pastes a GitHub URL. Frontend sends POST /api/projects/create with name + githubUrl.",
  },
  {
    id: "express",
    label: "Express API",
    icon: "ExpressJS-Dark",
    info: "JWT middleware validates the token. Controller clones the repo via simple-git, calls runContainer().",
  },
  {
    id: "mongo",
    label: "MongoDB",
    icon: "MongoDB",
    info: "Project document saved — name, subdomain, containerId, url, owner. Linked to your user account.",
    branch: true,
  },
  {
    id: "nodejs",
    label: "Node.js",
    icon: "NodeJS-Dark",
    info: "simple-git clones the GitHub repo onto the host machine into the workspaces/ directory.",
  },
  {
    id: "docker",
    label: "Docker",
    icon: "Docker",
    info: "react-runner container created. Project files bind-mounted at /app. Container kept alive with tail -f /dev/null.",
  },
  {
    id: "npm",
    label: "npm build",
    icon: "Npm-Dark",
    info: "execInContainer runs npm install then npm run build inside the container, streaming output via SSE.",
  },
  {
    id: "react",
    label: "Live site",
    icon: "React-Dark",
    info: "npx serve -s /app/dist -l 3000 starts. Docker maps port 3000 to a random host port. URL returned to frontend.",
    isLive: true,
  },
];

// Main flow order
const MAIN_ROW = ["github", "express", "nodejs", "docker", "npm", "react"];
const BRANCH_ROW = ["mongo"]; // sits below express

// Connections: [from, to, connectorIndex, options]
const CONNECTIONS = [
  { from: "github", to: "express", idx: 0 },
  { from: "express", to: "nodejs", idx: 1 },
  { from: "nodejs", to: "docker", idx: 2 },
  { from: "docker", to: "npm", idx: 3 },
  { from: "npm", to: "react", idx: 4 },
  { from: "express", to: "mongo", idx: 5, dashed: true, vertical: true },
];

// Step logs per node
const STEP_LOGS = {
  github: [
    { t: "sys", m: "POST /api/projects/create received" },
    { t: "ok", m: "JWT verified — auth OK" },
  ],
  express: [
    { t: "sys", m: "Validating request + auth headers" },
    { t: "ok", m: "Route handler invoked" },
  ],
  mongo: [
    { t: "sys", m: "Project.create({ name, owner... })" },
    { t: "ok", m: "Document saved to MongoDB" },
  ],
  nodejs: [
    { t: "sys", m: "simple-git.clone(githubUrl, path)" },
    { t: "ok", m: "Clone complete — 142 objects" },
  ],
  docker: [
    { t: "sys", m: "docker.createContainer(react-runner)" },
    { t: "ok", m: "Container a3f7c1d2 started" },
  ],
  npm: [
    { t: "sys", m: "npm install — /app" },
    { t: "ok", m: "287 packages installed" },
    { t: "sys", m: "npm run build — /app" },
    { t: "ok", m: "vite build — 214 modules transformed" },
  ],
  react: [
    { t: "sys", m: "npx serve -s /app/dist -l 3000" },
    { t: "ok", m: "Live → my-blog.localhost:54818" },
  ],
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeployPipeline() {
  const [nodeStates, setNodeStates] = useState({});
  const [connStates, setConnStates] = useState({});
  const [activeInfo, setActiveInfo] = useState(null);
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const svgRef = useRef();
  const canvasRef = useRef();
  const nodeRefs = useRef({});
  const logRef = useRef();

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // ── SVG connector drawing ───────────────────────────────────────────────
  const drawConnectors = useCallback(() => {
    if (!svgRef.current || !canvasRef.current) return;
    const cr = canvasRef.current.getBoundingClientRect();

    const center = (id) => {
      const el = nodeRefs.current[id];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.left - cr.left + r.width / 2,
        y: r.top - cr.top + r.height / 2 - 14,
      };
    };

    const COL = { idle: "rgba(0,0,0,0.1)", active: "#f97316", done: "#22c55e" };

    const mkMarker = (state, col) =>
      `<marker id="m-${state}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M2 2L8 5L2 8" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round"/>
      </marker>`;

    let html = `<defs>
      ${mkMarker("idle", COL.idle)}
      ${mkMarker("active", COL.active)}
      ${mkMarker("done", COL.done)}
    </defs>`;

    CONNECTIONS.forEach(({ from, to, idx, dashed, vertical }) => {
      const a = center(from),
        b = center(to);
      if (!a || !b) return;
      const st = connStates[idx] || "idle";
      const col = COL[st];
      const dash = dashed ? `stroke-dasharray="5 4"` : "";
      const d = vertical
        ? `M${a.x} ${a.y + 40} L${b.x} ${b.y - 40}`
        : `M${a.x + 40} ${a.y} L${b.x - 40} ${b.y}`;

      html += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.5"
        stroke-linecap="round" ${dash} marker-end="url(#m-${st})"
        style="transition:stroke .4s"/>`;
    });

    svgRef.current.innerHTML = html;
  }, [connStates]);

  useEffect(() => {
    drawConnectors();
    window.addEventListener("resize", drawConnectors);
    return () => window.removeEventListener("resize", drawConnectors);
  }, [drawConnectors]);

  // ── Helpers ─────────────────────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const setNode = (id, st) => setNodeStates((p) => ({ ...p, [id]: st }));
  const setConn = (idx, st) => setConnStates((p) => ({ ...p, [idx]: st }));
  const pushLog = (t, m) =>
    setLogs((p) => [...p, { t, m, id: Date.now() + Math.random() }]);

  // ── Run animation ────────────────────────────────────────────────────────
  async function startDeploy() {
    if (running) return;
    setRunning(true);
    setDone(false);
    setLogs([]);
    setNodeStates({});
    setConnStates({});
    setActiveInfo(null);
    setActiveNodeId(null);

    // connector index for each main-row node (incoming connector)
    const connFor = {
      github: null,
      express: 0,
      nodejs: 1,
      docker: 2,
      npm: 3,
      react: 4,
    };

    let mongoFired = false;

    for (const id of MAIN_ROW) {
      const node = NODES.find((n) => n.id === id);
      setNode(id, "running");
      setActiveInfo(node.info);
      setActiveNodeId(id);

      const cIdx = connFor[id];
      if (cIdx != null) setConn(cIdx, "active");

      // Parallel mongo branch fires after express
      if (id === "express" && !mongoFired) {
        mongoFired = true;
        setTimeout(async () => {
          setNode("mongo", "running");
          setConn(5, "active");
          for (const l of STEP_LOGS.mongo) {
            await sleep(280);
            pushLog(l.t, l.m);
          }
          setNode("mongo", "done");
          setConn(5, "done");
        }, 500);
      }

      for (const l of STEP_LOGS[id] ?? []) {
        await sleep(300);
        pushLog(l.t, l.m);
      }
      await sleep(420);
      setNode(id, "done");
      if (cIdx != null) setConn(cIdx, "done");
    }

    setDone(true);
    setRunning(false);
  }

  function resetAll() {
    setNodeStates({});
    setConnStates({});
    setLogs([]);
    setActiveInfo(null);
    setActiveNodeId(null);
    setRunning(false);
    setDone(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={s.wrapper}>
      <style>{`
        @keyframes dp-spin  { to { transform:rotate(360deg); } }
        @keyframes dp-ring  { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(1.2);opacity:0} }
        @keyframes dp-blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        .dp-node:hover .dp-box {
          border-color:rgba(249,115,22,0.55)!important;
          transform:translateY(-3px);
        }
        .dp-box { transition:border-color .2s,transform .2s,box-shadow .2s; }
      `}</style>

      {/* ── Canvas ───────────────────────────────────────────────────── */}
      <div ref={canvasRef} style={s.canvas}>
        <div style={s.grid} />
        <svg ref={svgRef} style={s.svgLayer} overflow="visible" />

        {/* Main row */}
        <div style={s.mainRow}>
          {MAIN_ROW.map((id) => {
            const node = NODES.find((n) => n.id === id);
            return (
              <PipelineNode
                key={id}
                node={node}
                state={nodeStates[id] || "idle"}
                active={activeNodeId === id}
                onClick={() => {
                  setActiveInfo(node.info);
                  setActiveNodeId(id);
                }}
                setRef={(el) => {
                  nodeRefs.current[id] = el;
                }}
              />
            );
          })}
        </div>

        {/* Branch row — mongo sits under express (index 1 in main row) */}
        <div style={s.branchRow}>
          <div style={s.branchSpacer} />
          {BRANCH_ROW.map((id) => {
            const node = NODES.find((n) => n.id === id);
            return (
              <PipelineNode
                key={id}
                node={node}
                state={nodeStates[id] || "idle"}
                active={activeNodeId === id}
                onClick={() => {
                  setActiveInfo(node.info);
                  setActiveNodeId(id);
                }}
                setRef={(el) => {
                  nodeRefs.current[id] = el;
                }}
              />
            );
          })}
        </div>

        {/* Info strip */}
        {activeInfo && (
          <div style={s.infoStrip}>
            <span style={{ color: "#f97316", fontSize: 13, flexShrink: 0 }}>
              ▸
            </span>
            <span style={s.infoText}>{activeInfo}</span>
          </div>
        )}

        {/* Log panel */}
        {logs.length > 0 && (
          <div style={s.logPanel}>
            <div style={s.logHead}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: done ? "#22c55e" : "#f97316",
                  display: "inline-block",
                  flexShrink: 0,
                  animation: running ? "dp-blink 1.2s infinite" : "none",
                }}
              />
              <span style={s.logHeadTxt}>deploy log</span>
            </div>
            <div ref={logRef} style={s.logBody}>
              {logs.map((l) => (
                <div
                  key={l.id}
                  style={{
                    fontFamily: "monospace",
                    fontSize: 10.5,
                    lineHeight: 1.75,
                    color:
                      l.t === "ok"
                        ? "#4ade80"
                        : l.t === "err"
                        ? "#f87171"
                        : "#60a5fa",
                  }}
                >
                  {l.m}
                </div>
              ))}
              {done && (
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 11,
                    color: "#f97316",
                    fontWeight: 700,
                    marginTop: 4,
                  }}
                >
                  ✓ deployed successfully
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div style={s.controls}>
        <button
          style={{ ...s.runBtn, opacity: running ? 0.55 : 1 }}
          onClick={startDeploy}
          disabled={running}
        >
          {running ? "Deploying…" : done ? "▶ Run again" : "▶ Run deploy"}
        </button>
        <button style={s.resetBtn} onClick={resetAll}>
          Reset
        </button>
        <span style={s.hint}>
          {running ? "Streaming pipeline…" : "Click any node to inspect"}
        </span>
      </div>
    </div>
  );
}

// ─── PipelineNode ─────────────────────────────────────────────────────────────

function PipelineNode({ node, state, active, onClick, setRef }) {
  const isRunning = state === "running";
  const isDone = state === "done";
  const isError = state === "error";

  const border = isRunning
    ? "#f97316"
    : isDone
    ? "#22c55e"
    : isError
    ? "#ef4444"
    : active
    ? "rgba(249,115,22,0.4)"
    : "rgba(0,0,0,0.1)";

  const shadow = isRunning
    ? "0 0 0 4px rgba(249,115,22,0.12)"
    : isDone
    ? "0 0 0 4px rgba(34,197,94,0.1)"
    : "none";

  return (
    <div className="dp-node" style={ns.node} onClick={onClick} ref={setRef}>
      <div
        className="dp-box"
        style={{
          ...ns.box,
          borderColor: border,
          boxShadow: shadow,
          background: node.isLive ? "rgba(34,197,94,0.06)" : "#fff",
        }}
      >
        {isRunning && <div style={ns.ring} />}

        <TechIcon name={node.icon} size={36} />

        {(isRunning || isDone || isError) && (
          <div
            style={{
              ...ns.badge,
              background: isRunning
                ? "#f97316"
                : isDone
                ? "#22c55e"
                : "#ef4444",
              animation: isRunning ? "dp-spin 1s linear infinite" : "none",
            }}
          >
            {isRunning ? "↻" : isDone ? "✓" : "✗"}
          </div>
        )}
      </div>
      <div style={ns.label}>{node.label}</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const FONT = "'DM Sans', system-ui, sans-serif";

const s = {
  wrapper: {
    fontFamily: FONT,
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 20,
    overflow: "hidden",
    background: "#fff",
  },
  canvas: {
    position: "relative",
    background: "#f8f7f4",
    padding: "32px 20px 112px",
    minHeight: 300,
    overflow: "hidden",
  },
  grid: {
    position: "absolute",
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)`,
    backgroundSize: "28px 28px",
  },
  svgLayer: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    overflow: "visible",
  },
  mainRow: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  branchRow: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  branchSpacer: { width: 96, flexShrink: 0 },
  infoStrip: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 288,
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: "9px 14px",
    zIndex: 5,
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  },
  infoText: { fontSize: 12, color: "rgba(11,11,15,0.6)", lineHeight: 1.5 },
  logPanel: {
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 268,
    background: "#0d0d0d",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 12,
    overflow: "hidden",
    zIndex: 5,
  },
  logHead: {
    padding: "7px 12px",
    display: "flex",
    alignItems: "center",
    gap: 7,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  logHeadTxt: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.35)",
    textTransform: "uppercase",
  },
  logBody: {
    padding: "8px 12px",
    maxHeight: 118,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "13px 20px",
    borderTop: "1px solid rgba(0,0,0,0.06)",
    background: "#fff",
  },
  runBtn: {
    padding: "9px 20px",
    background: "#f97316",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: FONT,
    letterSpacing: 0.3,
    transition: "opacity .2s",
  },
  resetBtn: {
    padding: "9px 16px",
    background: "transparent",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: FONT,
    color: "rgba(11,11,15,0.55)",
  },
  hint: { fontSize: 12, color: "rgba(11,11,15,0.38)", marginLeft: "auto" },
};

const ns = {
  node: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 7,
    userSelect: "none",
    flexShrink: 0,
  },
  box: {
    width: 76,
    height: 76,
    borderRadius: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1.5px solid",
    position: "relative",
    overflow: "visible",
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(11,11,15,0.5)",
    textAlign: "center",
    maxWidth: 84,
    lineHeight: 1.3,
  },
  badge: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 20,
    height: 20,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    fontWeight: 700,
    color: "#fff",
    border: "2px solid #fff",
    zIndex: 3,
  },
  ring: {
    position: "absolute",
    inset: -5,
    borderRadius: 22,
    border: "2px solid #f97316",
    animation: "dp-ring 1.2s ease-out infinite",
    pointerEvents: "none",
  },
};
