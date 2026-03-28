// ─── DeployPipeline.jsx ───────────────────────────────────────────────────────
// Syncs with real SSE build events from docker.service.js
// Nodes: github → express → nodejs → docker → npm → react
// Branch: express → mongo (dashed, fires when project is saved)
/* eslint-disable */
import { useCallback, useEffect, useRef, useState } from "react";

const ICON_BASE = "https://cdn.jsdelivr.net/gh/tandpfun/skill-icons@main/icons";

function TechIcon({ name, size = 36 }) {
  return (
    <img
      src={`${ICON_BASE}/${name}.svg`}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: "contain", display: "block", pointerEvents: "none" }}
      onError={(e) => {
        e.target.style.display = "none";
      }}
    />
  );
}

// ─── Node definitions ─────────────────────────────────────────────────────────
const NODES = [
  {
    id: "github",
    label: "GitHub",
    icon: "Github-Dark",
    info: "User submits a GitHub URL. Frontend sends POST /api/projects/create with auth token.",
  },
  {
    id: "express",
    label: "Express API",
    icon: "ExpressJS-Dark",
    info: "authMiddleware validates JWT. Controller starts the deploy pipeline.",
  },
  {
    id: "nodejs",
    label: "git clone",
    icon: "NodeJS-Dark",
    info: "simple-git clones the GitHub repo into workspace/<name>/ on the host.",
  },
  {
    id: "docker",
    label: "Docker",
    icon: "Docker",
    info: "react-runner container created. workspace bind-mounted at /app. tail -f /dev/null keeps it alive.",
  },
  {
    id: "npm",
    label: "npm build",
    icon: "Npm-Dark",
    info: "exec: npm install → then exec: npm run build. Each step streams stdout/stderr via SSE.",
  },
  {
    id: "react",
    label: "Live site",
    icon: "React-Dark",
    info: "npx serve -s /app/dist -l 3000 starts. Docker maps a random host port. URL returned.",
    isLive: true,
  },
];

const BRANCH_NODES = [
  {
    id: "mongo",
    label: "MongoDB",
    icon: "MongoDB",
    info: "Project document saved: { name, githubUrl, subdomain, containerId, owner }.",
    branch: true,
  },
];

const MAIN_ROW = ["github", "express", "nodejs", "docker", "npm", "react"];
const BRANCH_ROW = ["mongo"];

// Connector definitions — idx matches the key used in connStates
const CONNECTIONS = [
  { from: "github", to: "express", idx: 0 },
  { from: "express", to: "nodejs", idx: 1 },
  { from: "nodejs", to: "docker", idx: 2 },
  { from: "docker", to: "npm", idx: 3 },
  { from: "npm", to: "react", idx: 4 },
  { from: "express", to: "mongo", idx: 5, dashed: true, vertical: true },
];

// ─── SSE → Node mapping ───────────────────────────────────────────────────────
// This is the core sync logic. Each SSE message maps to a pipeline node.
// Called by Deploy.jsx and used to drive externalNodeStates + externalConnStates.

export function sseMessageToNodeId(eventType, data) {
  const msg = (data?.message || "").toLowerCase();
  const type = (data?.type || "").toLowerCase();

  // step_start events from docker.service.js are the most reliable signals
  if (eventType === "step_start") {
    if (msg.includes("npm install") || msg.includes("installing")) return "npm";
    if (msg.includes("npm run build") || msg.includes("building")) return "npm";
    if (msg.includes("serve") || msg.includes("starting server"))
      return "react";
    if (msg.includes("docker") || msg.includes("container")) return "docker";
    if (msg.includes("clone") || msg.includes("cloning")) return "nodejs";
  }

  if (eventType === "step_done") {
    if (msg.includes("npm install") || msg.includes("installing")) return "npm";
    if (msg.includes("npm run build") || msg.includes("building")) return "npm";
    if (msg.includes("serve") || msg.includes("starting server"))
      return "react";
    if (msg.includes("docker") || msg.includes("container")) return "docker";
    if (msg.includes("clone") || msg.includes("cloning")) return "nodejs";
  }

  // status events from project.controller.js
  if (eventType === "status") {
    if (msg.includes("cloning repository")) return "nodejs";
    if (msg.includes("repository cloned")) return "nodejs"; // done signal
    if (msg.includes("starting docker")) return "docker";
    if (msg.includes("docker build")) return "docker";
    if (msg.includes("existing project")) return "mongo";
    if (msg.includes("project replaced")) return "mongo";
  }

  // system/log events from docker.service.js
  if (eventType === "log" || eventType === "system") {
    if (msg.includes("creating docker container")) return "docker";
    if (msg.includes("container started")) return "docker";
    if (msg.includes("npm install")) return "npm";
    if (msg.includes("npm run build")) return "npm";
    if (
      msg.includes("serve") ||
      msg.includes("app is live") ||
      msg.includes("live →")
    )
      return "react";
    if (msg.includes("waiting for port")) return "react";
    if (msg.includes("clone") || msg.includes("cloning")) return "nodejs";
    if (msg.includes("mongo") || msg.includes("saved")) return "mongo";
  }

  return null;
}

// Which connector index activates when a node becomes active
const CONN_FOR = {
  github: null,
  express: 0,
  nodejs: 1,
  docker: 2,
  npm: 3,
  react: 4,
  mongo: 5,
};

// Demo logs for standalone mode
const DEMO_LOGS = {
  github: [
    { t: "sys", m: "POST /api/projects/create" },
    { t: "ok", m: "Auth headers present" },
  ],
  express: [
    { t: "sys", m: "JWT verified" },
    { t: "ok", m: "Route handler invoked" },
  ],
  nodejs: [
    { t: "sys", m: "simple-git.clone(githubUrl)" },
    { t: "ok", m: "Cloned — 142 objects" },
  ],
  docker: [
    { t: "sys", m: "docker.createContainer(react-runner)" },
    { t: "ok", m: "Container started" },
  ],
  npm: [
    { t: "sys", m: "npm install — /app" },
    { t: "ok", m: "287 packages installed" },
    { t: "sys", m: "npm run build" },
    { t: "ok", m: "vite build — 214 modules" },
  ],
  react: [
    { t: "sys", m: "npx serve -s /app/dist -l 3000" },
    { t: "ok", m: "Live → my-app.localhost:54818" },
  ],
  mongo: [
    { t: "sys", m: "Project.findOneAndReplace()" },
    { t: "ok", m: "Saved to MongoDB" },
  ],
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function DeployPipeline({
  // When these are provided, pipeline is "controlled" by real SSE events
  externalNodeStates,
  externalConnStates,
  externalLogs,
  externalDone,
  externalRunning,
}) {
  const isControlled = externalNodeStates !== undefined;

  const [intNodeStates, setIntNodeStates] = useState({});
  const [intConnStates, setIntConnStates] = useState({});
  const [intLogs, setIntLogs] = useState([]);
  const [intRunning, setIntRunning] = useState(false);
  const [intDone, setIntDone] = useState(false);

  const nodeStates = isControlled ? externalNodeStates : intNodeStates;
  const connStates = isControlled ? externalConnStates || {} : intConnStates;
  const logs = isControlled ? externalLogs || [] : intLogs;
  const running = isControlled ? !!externalRunning : intRunning;
  const done = isControlled ? !!externalDone : intDone;

  const [activeInfo, setActiveInfo] = useState(null);
  const [activeNodeId, setActiveNodeId] = useState(null);

  const svgRef = useRef();
  const canvasRef = useRef();
  const nodeRefs = useRef({});
  const logRef = useRef();

  // Auto-scroll log panel
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Auto-follow running node's info text
  useEffect(() => {
    const running = Object.entries(nodeStates).find(([, v]) => v === "running");
    if (running) {
      const node = [...NODES, ...BRANCH_NODES].find((n) => n.id === running[0]);
      if (node) {
        setActiveInfo(node.info);
        setActiveNodeId(node.id);
      }
    }
  }, [nodeStates]);

  // ── SVG connector drawing ─────────────────────────────────────────────────
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
    const mkM = (st, col) =>
      `<marker id="m-${st}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M2 2L8 5L2 8" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round"/>
      </marker>`;

    let html = `<defs>${mkM("idle", COL.idle)}${mkM("active", COL.active)}${mkM(
      "done",
      COL.done
    )}</defs>`;

    CONNECTIONS.forEach(({ from, to, idx, dashed, vertical }) => {
      const a = center(from),
        b = center(to);
      if (!a || !b) return;
      const st = connStates[idx] || "idle";
      const col = COL[st];
      const dash = dashed ? `stroke-dasharray="5 4"` : "";

      let d;
      if (vertical) {
        // express → mongo: go straight down from express center
        d = `M${a.x} ${a.y + 40} L${b.x} ${b.y - 40}`;
      } else {
        d = `M${a.x + 40} ${a.y} L${b.x - 40} ${b.y}`;
      }

      html += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.5"
        stroke-linecap="round" ${dash} marker-end="url(#m-${st})"
        style="transition:stroke .35s,stroke-dashoffset .35s"/>`;

      // Animated travelling dot when connector is active
      if (st === "active") {
        html += `<circle r="3" fill="${col}" opacity="0.9">
          <animateMotion dur="1.2s" repeatCount="indefinite">
            <mpath href="#path-unused"/>
          </animateMotion>
        </circle>`;
      }
    });

    svgRef.current.innerHTML = html;
  }, [connStates]);

  useEffect(() => {
    drawConnectors();
    window.addEventListener("resize", drawConnectors);
    return () => window.removeEventListener("resize", drawConnectors);
  }, [drawConnectors]);

  // ── Demo helpers ──────────────────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sINode = (id, st) => setIntNodeStates((p) => ({ ...p, [id]: st }));
  const sIConn = (idx, st) => setIntConnStates((p) => ({ ...p, [idx]: st }));
  const addILog = (t, m) =>
    setIntLogs((p) => [...p, { t, m, id: Date.now() + Math.random() }]);

  async function startDemo() {
    if (intRunning || isControlled) return;
    setIntRunning(true);
    setIntDone(false);
    setIntNodeStates({});
    setIntConnStates({});
    setIntLogs([]);
    setActiveInfo(null);
    setActiveNodeId(null);

    // Mongo fires alongside express (asynchronously)
    let mongoFired = false;

    for (const id of MAIN_ROW) {
      const node = [...NODES, ...BRANCH_NODES].find((n) => n.id === id);
      sINode(id, "running");
      setActiveInfo(node.info);
      setActiveNodeId(id);
      const ci = CONN_FOR[id];
      if (ci != null) sIConn(ci, "active");

      if (id === "express" && !mongoFired) {
        mongoFired = true;
        // Fire mongo branch after a short delay
        setTimeout(async () => {
          sINode("mongo", "running");
          sIConn(5, "active");
          for (const l of DEMO_LOGS.mongo) {
            await sleep(250);
            addILog(l.t, l.m);
          }
          sINode("mongo", "done");
          sIConn(5, "done");
        }, 400);
      }

      for (const l of DEMO_LOGS[id] ?? []) {
        await sleep(280);
        addILog(l.t, l.m);
      }
      await sleep(380);
      sINode(id, "done");
      if (ci != null) sIConn(ci, "done");
    }

    setIntDone(true);
    setIntRunning(false);
  }

  function resetDemo() {
    if (isControlled) return;
    setIntNodeStates({});
    setIntConnStates({});
    setIntLogs([]);
    setActiveInfo(null);
    setActiveNodeId(null);
    setIntRunning(false);
    setIntDone(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const allNodes = [...NODES, ...BRANCH_NODES];

  return (
    <div style={s.wrapper}>
      <style>{`
        @keyframes dp-spin  { to{transform:rotate(360deg)} }
        @keyframes dp-ring  { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(1.25);opacity:0} }
        @keyframes dp-blink { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes dp-pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
        .dp-node:hover .dp-box { border-color:rgba(249,115,22,0.5)!important; transform:translateY(-2px); }
        .dp-box { transition:border-color .2s,transform .2s,box-shadow .2s; cursor:pointer; }
      `}</style>

      <div ref={canvasRef} style={s.canvas}>
        {/* Grid background */}
        <div style={s.grid} />

        {/* SVG connector layer */}
        <svg ref={svgRef} style={s.svgLayer} overflow="visible" />

        {/* Live deploying badge */}
        {running && (
          <div style={s.liveBadge}>
            <span style={s.liveDot} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#f97316" }}>
              {isControlled ? "Deploying live…" : "Running demo…"}
            </span>
          </div>
        )}

        {/* Main row */}
        <div style={s.mainRow}>
          {MAIN_ROW.map((id) => {
            const node = allNodes.find((n) => n.id === id);
            return (
              <PipelineNode
                key={id}
                node={node}
                state={nodeStates[id] || "idle"}
                isActive={activeNodeId === id}
                onRef={(el) => {
                  nodeRefs.current[id] = el;
                }}
                onClick={() => {
                  setActiveInfo(node.info);
                  setActiveNodeId(id);
                }}
              />
            );
          })}
        </div>

        {/* Branch row */}
        <div style={s.branchRow}>
          {/* Spacer to align mongo under express (2nd node, index=1, skip 1 node worth of space) */}
          <div style={s.branchSpacer} />
          {BRANCH_ROW.map((id) => {
            const node = allNodes.find((n) => n.id === id);
            return (
              <PipelineNode
                key={id}
                node={node}
                state={nodeStates[id] || "idle"}
                isActive={activeNodeId === id}
                onRef={(el) => {
                  nodeRefs.current[id] = el;
                }}
                onClick={() => {
                  setActiveInfo(node.info);
                  setActiveNodeId(id);
                }}
              />
            );
          })}
        </div>

        {/* Info strip — follows active node */}
        <div style={s.infoStrip}>
          <span style={{ color: "#f97316", fontSize: 13, flexShrink: 0 }}>
            ▸
          </span>
          <span style={s.infoText}>
            {activeInfo ||
              "Click any node to see what it does during deployment."}
          </span>
        </div>

        {/* Live log panel */}
        {logs.length > 0 && (
          <div style={s.logPanel}>
            <div style={s.logHead}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: done ? "#22c55e" : running ? "#f97316" : "#888",
                  display: "inline-block",
                  flexShrink: 0,
                  animation: running ? "dp-blink 1s infinite" : "none",
                }}
              />
              <span style={s.logHeadTxt}>
                {isControlled ? "live deploy log" : "demo log"}
              </span>
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

      {/* Controls */}
      {!isControlled ? (
        <div style={s.controls}>
          <button
            style={{ ...s.runBtn, opacity: intRunning ? 0.55 : 1 }}
            onClick={startDemo}
            disabled={intRunning}
          >
            {intRunning ? "Running…" : intDone ? "▶ Run again" : "▶ Run demo"}
          </button>
          <button style={s.resetBtn} onClick={resetDemo}>
            Reset
          </button>
          <span style={s.hint}>
            {intRunning ? "Streaming pipeline…" : "Click any node to inspect"}
          </span>
        </div>
      ) : (
        <div style={s.hintRow}>
          <span style={s.hint}>Click any node to see what it does</span>
          {done && (
            <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>
              ✓ Pipeline complete
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PipelineNode ─────────────────────────────────────────────────────────────

function PipelineNode({ node, state, isActive, onRef, onClick }) {
  const isRunning = state === "running";
  const isDone = state === "done";
  const isError = state === "error";

  const border = isRunning
    ? "#f97316"
    : isDone
    ? "#22c55e"
    : isError
    ? "#ef4444"
    : isActive
    ? "rgba(249,115,22,0.4)"
    : "rgba(0,0,0,0.1)";

  const shadow = isRunning
    ? "0 0 0 4px rgba(249,115,22,0.14)"
    : isDone
    ? "0 0 0 4px rgba(34,197,94,0.1)"
    : "none";

  return (
    <div className="dp-node" style={ns.node} onClick={onClick} ref={onRef}>
      <div
        className="dp-box"
        style={{
          ...ns.box,
          borderColor: border,
          boxShadow: shadow,
          background: node.isLive ? "rgba(34,197,94,0.05)" : "#fff",
        }}
      >
        {/* Pulsing ring when running */}
        {isRunning && <div style={ns.ring} />}

        <TechIcon name={node.icon} size={34} />

        {/* Status badge */}
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
      <div
        style={{
          ...ns.label,
          color: isRunning
            ? "#f97316"
            : isDone
            ? "#22c55e"
            : isError
            ? "#ef4444"
            : "rgba(11,11,15,0.5)",
          fontWeight: isRunning || isDone ? 700 : 500,
          transition: "color .3s",
        }}
      >
        {node.label}
      </div>
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
    padding: "28px 20px 108px",
    minHeight: 280,
    overflow: "hidden",
  },
  grid: {
    position: "absolute",
    inset: 0,
    backgroundImage: `linear-gradient(rgba(0,0,0,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.04) 1px,transparent 1px)`,
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

  liveBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    display: "flex",
    alignItems: "center",
    gap: 7,
    background: "rgba(249,115,22,0.08)",
    border: "1px solid rgba(249,115,22,0.2)",
    borderRadius: 999,
    padding: "5px 12px",
    zIndex: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#f97316",
    display: "inline-block",
    animation: "dp-blink 1s infinite",
  },

  mainRow: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  branchRow: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
  },
  branchSpacer: { width: 98, flexShrink: 0 },

  infoStrip: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 276,
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.07)",
    borderRadius: 12,
    padding: "9px 14px",
    zIndex: 5,
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    minHeight: 44,
  },
  infoText: { fontSize: 12, color: "rgba(11,11,15,0.6)", lineHeight: 1.55 },

  logPanel: {
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 252,
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
    color: "rgba(255,255,255,0.3)",
    textTransform: "uppercase",
  },
  logBody: {
    padding: "8px 12px",
    maxHeight: 112,
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
  hintRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 20px",
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
    color: "rgba(11,11,15,0.5)",
  },
  hint: { fontSize: 12, color: "rgba(11,11,15,0.35)", marginLeft: "auto" },
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
    width: 74,
    height: 74,
    borderRadius: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1.5px solid",
    position: "relative",
    overflow: "visible",
  },
  label: { fontSize: 11, textAlign: "center", maxWidth: 82, lineHeight: 1.3 },
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
