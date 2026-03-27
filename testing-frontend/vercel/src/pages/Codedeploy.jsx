/* eslint-disable */
import { useEffect, useRef, useState, useCallback } from "react";
import { getAuthHeaders, clearToken } from "../lib/auth";
import { API_BASE } from "../lib/http";

// ─── Default starter files ────────────────────────────────────────────────────

const DEFAULT_FILES = {
  "src/App.jsx": `import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div style={{
      maxWidth: 600, margin: '80px auto',
      textAlign: 'center', fontFamily: 'system-ui, sans-serif'
    }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
        Hello from VercelLite IDE ⚡
      </h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Edit this file — it hot-reloads instantly!
      </p>
      <button onClick={() => setCount(c => c + 1)} style={{
        padding: '12px 28px', fontSize: '1rem',
        background: '#f97316', color: '#fff',
        border: 'none', borderRadius: 8, cursor: 'pointer',
      }}>
        Count: {count}
      </button>
    </div>
  )
}`,
  "src/App.css": `* { box-sizing: border-box; }
body { margin: 0; background: #f9f9f9; }`,
  "src/main.jsx": `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
)`,
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
  "package.json": `{
  "name": "my-app",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}`,
  "vite.config.js": `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: { usePolling: true },
  }
})`,
};

// ─── Syntax highlight ─────────────────────────────────────────────────────────

function highlight(code, lang) {
  if (!code) return "";
  let h = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  if (["jsx", "js", "javascript", "typescript", "tsx"].includes(lang)) {
    h = h.replace(
      /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g,
      '<span class="hl-s">$1$2$1</span>'
    );
    h = h.replace(
      /\b(import|export|default|from|const|let|var|function|return|if|else|for|while|class|extends|new|this|typeof|async|await|true|false|null|undefined)\b/g,
      '<span class="hl-k">$1</span>'
    );
    h = h.replace(/(&lt;\/?)([\w.]+)/g, '$1<span class="hl-t">$2</span>');
    h = h.replace(/(\/\/[^\n]*)/g, '<span class="hl-c">$1</span>');
    h = h.replace(/\b(\d+)\b/g, '<span class="hl-n">$1</span>');
  } else if (lang === "css") {
    h = h.replace(/([.#]?[\w-]+)\s*\{/g, '<span class="hl-t">$1</span> {');
    h = h.replace(/([\w-]+)\s*:/g, '<span class="hl-k">$1</span>:');
    h = h.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-c">$1</span>');
  } else if (lang === "html") {
    h = h.replace(/(&lt;\/?)([\w]+)/g, '$1<span class="hl-t">$2</span>');
    h = h.replace(/([\w-]+=)/g, '<span class="hl-k">$1</span>');
    h = h.replace(
      /(["'])((?:\\.|(?!\1)[^\\])*)\1/g,
      '<span class="hl-s">$1$2$1</span>'
    );
  }
  return h;
}

function getLang(filename) {
  const ext = filename?.split(".").pop() || "";
  return (
    {
      jsx: "jsx",
      js: "javascript",
      ts: "typescript",
      tsx: "tsx",
      css: "css",
      html: "html",
      json: "json",
    }[ext] || "text"
  );
}

function getIcon(filename) {
  const ext = filename?.split(".").pop() || "";
  return (
    {
      jsx: "⚛",
      tsx: "⚛",
      js: "JS",
      ts: "TS",
      css: "🎨",
      html: "🌐",
      json: "{}",
      md: "📝",
    }[ext] || "📄"
  );
}

// ─── File tree builder ────────────────────────────────────────────────────────

function buildTree(files) {
  const tree = {};
  for (const p of Object.keys(files)) {
    const parts = p.split("/");
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = null;
  }
  return tree;
}

// ─── FileTree component ───────────────────────────────────────────────────────

function FileTree({
  tree,
  prefix = "",
  activeFile,
  onSelect,
  onDelete,
  modified,
}) {
  const [collapsed, setCollapsed] = useState({});

  const sorted = Object.entries(tree).sort(([, av], [, bv]) => {
    if (av !== null && bv === null) return -1;
    if (av === null && bv !== null) return 1;
    return 0;
  });

  return (
    <div>
      {sorted.map(([name, subtree]) => {
        const fullPath = prefix ? `${prefix}/${name}` : name;
        const isDir = subtree !== null;
        const depth = prefix ? prefix.split("/").length : 0;

        if (isDir) {
          const isOpen = !collapsed[fullPath];
          return (
            <div key={fullPath}>
              <div
                style={{ ...e.treeRow, paddingLeft: depth * 14 + 8 }}
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [fullPath]: isOpen }))
                }
              >
                <span style={{ fontSize: 9, opacity: 0.4, marginRight: 4 }}>
                  {isOpen ? "▼" : "▶"}
                </span>
                <span style={{ fontSize: 12, marginRight: 5 }}>📁</span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    fontWeight: 600,
                  }}
                >
                  {name}
                </span>
              </div>
              {isOpen && (
                <FileTree
                  tree={subtree}
                  prefix={fullPath}
                  activeFile={activeFile}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  modified={modified}
                />
              )}
            </div>
          );
        }

        const isActive = fullPath === activeFile;
        const isDirty = modified.has(fullPath);

        return (
          <div
            key={fullPath}
            className="tree-file-row"
            style={{ position: "relative" }}
          >
            <div
              style={{
                ...e.treeRow,
                paddingLeft: depth * 14 + 20,
                background: isActive ? "rgba(249,115,22,0.12)" : undefined,
                borderRight: isActive
                  ? "2px solid #f97316"
                  : "2px solid transparent",
              }}
              onClick={() => onSelect(fullPath)}
            >
              <span
                style={{
                  fontSize: 10,
                  marginRight: 6,
                  opacity: 0.7,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  color: isActive ? "#f97316" : "#888",
                }}
              >
                {getIcon(name)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  flex: 1,
                  color: isActive ? "#f97316" : "var(--text-primary)",
                  fontWeight: isActive ? 700 : 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </span>
              {isDirty && (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "#f97316",
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                className="tree-del"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onDelete(fullPath);
                }}
                title="Delete"
                style={{
                  fontSize: 13,
                  opacity: 0,
                  color: "#ef4444",
                  paddingLeft: 4,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                ×
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Code editor with syntax highlight + line numbers ────────────────────────

function CodeEditor({ value, onChange, language }) {
  const taRef = useRef();
  const hlRef = useRef();
  const lines = (value || "").split("\n").length;

  const sync = () => {
    if (hlRef.current && taRef.current) {
      hlRef.current.scrollTop = taRef.current.scrollTop;
      hlRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  const handleKey = useCallback(
    (ev) => {
      if (ev.key === "Tab") {
        ev.preventDefault();
        const ta = taRef.current,
          s = ta.selectionStart,
          end = ta.selectionEnd;
        const next = value.slice(0, s) + "  " + value.slice(end);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = s + 2;
        });
      }
      if (ev.key === "Enter") {
        ev.preventDefault();
        const ta = taRef.current,
          s = ta.selectionStart;
        const currentLine = value.slice(0, s).split("\n").pop();
        const indent = currentLine.match(/^(\s*)/)[1];
        const extra = /[{([<]$/.test(currentLine.trim()) ? "  " : "";
        const next =
          value.slice(0, s) +
          "\n" +
          indent +
          extra +
          value.slice(ta.selectionEnd);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd =
            s + 1 + indent.length + extra.length;
        });
      }
    },
    [value, onChange]
  );

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        display: "flex",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      {/* line numbers */}
      <div style={e.lineNums}>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} style={{ lineHeight: "20px", height: 20 }}>
            {i + 1}
          </div>
        ))}
      </div>

      {/* highlight layer */}
      <pre
        ref={hlRef}
        aria-hidden
        style={e.hlLayer}
        dangerouslySetInnerHTML={{ __html: highlight(value, language) + "\n" }}
      />

      {/* editable layer */}
      <textarea
        ref={taRef}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        onKeyDown={handleKey}
        onScroll={sync}
        spellCheck={false}
        style={e.textarea}
      />
    </div>
  );
}

// ─── Terminal panel ───────────────────────────────────────────────────────────

function Terminal({ lines, onCommand, busy }) {
  const [input, setInput] = useState("");
  const [hist, setHist] = useState([]);
  const [hi, setHi] = useState(-1);
  const endRef = useRef();
  const inputRef = useRef();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const submit = () => {
    if (!input.trim() || busy) return;
    setHist((h) => [input, ...h]);
    setHi(-1);
    onCommand(input.trim());
    setInput("");
  };

  const onKey = (ev) => {
    if (ev.key === "Enter") submit();
    if (ev.key === "ArrowUp") {
      ev.preventDefault();
      const i = Math.min(hi + 1, hist.length - 1);
      setHi(i);
      setInput(hist[i] || "");
    }
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      const i = Math.max(hi - 1, -1);
      setHi(i);
      setInput(i === -1 ? "" : hist[i]);
    }
  };

  const C = {
    stdout: "#4ade80",
    stderr: "#f87171",
    system: "#60a5fa",
    error: "#f87171",
    cmd: "#fbbf24",
  };

  return (
    <div style={e.term} onClick={() => inputRef.current?.focus()}>
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            lineHeight: "20px",
            color: C[l.type] || "#9ca3af",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {l.type === "cmd" && (
            <span style={{ color: "#6ee7b7", marginRight: 8 }}>$</span>
          )}
          {l.text}
        </div>
      ))}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}
      >
        <span
          style={{
            color: "#6ee7b7",
            fontFamily: "monospace",
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          {busy ? "⏳" : "→"}
        </span>
        <input
          ref={inputRef}
          value={input}
          onChange={(ev) => setInput(ev.target.value)}
          onKeyDown={onKey}
          disabled={busy}
          placeholder={busy ? "running…" : "type a command…"}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#e5e7eb",
            fontFamily: "monospace",
            fontSize: 12,
            caretColor: "#f97316",
          }}
        />
      </div>
      <div ref={endRef} />
    </div>
  );
}

// ─── Main CodeDeploy Page ─────────────────────────────────────────────────────

export default function CodeDeploy({ navigate }) {
  const [files, setFiles] = useState(DEFAULT_FILES);
  const [active, setActive] = useState("src/App.jsx");
  const [modified, setModified] = useState(new Set());
  const [projectName, setProjectName] = useState("my-app");

  // Dev session
  const [devStatus, setDevStatus] = useState("idle"); // idle | starting | running | error
  const [devPort, setDevPort] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  // Terminal
  const [termLines, setTermLines] = useState([
    {
      type: "system",
      text: "VercelLite IDE — write React, run the dev server, then deploy.",
    },
    { type: "system", text: "Click ▶ Run Dev Server to start." },
  ]);
  const [termBusy, setTermBusy] = useState(false);

  // Deploy
  const [deploying, setDeploying] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState(null);
  const [deployLogs, setDeployLogs] = useState([]);

  // UI layout
  const [previewOpen, setPreviewOpen] = useState(false);
  const [panelTab, setPanelTab] = useState("terminal");
  const [termH, setTermH] = useState(200);
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");

  const authHeaders = getAuthHeaders();

  // ── Terminal helpers ────────────────────────────────────────────────────────

  function pushTerm(type, text) {
    setTermLines((prev) => [...prev, { type, text }]);
  }

  // ── File ops ────────────────────────────────────────────────────────────────

  function updateFile(path, content) {
    setFiles((prev) => ({ ...prev, [path]: content }));
    setModified((prev) => new Set([...prev, path]));
  }

  function deleteFile(path) {
    setFiles((prev) => {
      const n = { ...prev };
      delete n[path];
      return n;
    });
    setModified((prev) => {
      const s = new Set(prev);
      s.delete(path);
      return s;
    });
    if (active === path)
      setActive(Object.keys(files).find((k) => k !== path) || "");
  }

  function addFile(name) {
    if (!name.trim() || files[name]) return;
    setFiles((prev) => ({ ...prev, [name]: "" }));
    setActive(name);
    setModified((prev) => new Set([...prev, name]));
    setShowNewFile(false);
    setNewFileName("");
  }

  // ── Hot sync ────────────────────────────────────────────────────────────────

  function handleFileChange(content) {
    updateFile(active, content);
    clearTimeout(window._syncT);
    window._syncT = setTimeout(async () => {
      if (!sessionId) return;
      try {
        await fetch(`${API_BASE}/api/ide/sync/${sessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ path: active, content }),
        });
      } catch (_) {}
    }, 600);
  }

  // ── Dev server ──────────────────────────────────────────────────────────────

  async function startDev() {
    if (devStatus === "running") return;
    setDevStatus("starting");
    setTermBusy(true);
    pushTerm(
      "system",
      "🐳 Scaffolding React project and starting dev container…"
    );
    pushTerm(
      "system",
      "   This takes ~15s on first run (npm install inside Docker)."
    );

    try {
      const res = await fetch(`${API_BASE}/api/ide/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ projectName, files }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSessionId(data.sessionId);
      setDevPort(data.port);
      setDevStatus("running");
      setPreviewOpen(true);
      pushTerm("system", `✅ Vite dev server running on port ${data.port}`);
      pushTerm("stdout", `Session: ${data.sessionId.slice(0, 8)}…`);
      pushTerm("system", "Edit any file — changes hot-reload automatically.");
    } catch (err) {
      setDevStatus("error");
      pushTerm("error", `Failed to start: ${err.message}`);
    } finally {
      setTermBusy(false);
    }
  }

  async function stopDev() {
    if (!sessionId) return;
    setTermBusy(true);
    pushTerm("system", "⏹ Stopping dev server…");
    try {
      await fetch(`${API_BASE}/api/ide/stop/${sessionId}`, {
        method: "POST",
        headers: authHeaders,
      });
      setDevStatus("idle");
      setDevPort(null);
      setSessionId(null);
      setPreviewOpen(false);
      pushTerm("system", "Dev server stopped.");
    } catch (err) {
      pushTerm("error", err.message);
    } finally {
      setTermBusy(false);
    }
  }

  // ── Terminal command runner ─────────────────────────────────────────────────

  async function runCommand(cmd) {
    if (!sessionId) {
      pushTerm("error", "No active session. Start the dev server first.");
      return;
    }
    pushTerm("cmd", cmd);
    setTermBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/ide/exec/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ cmd }),
      });
      const data = await res.json();
      data.stdout
        ?.split("\n")
        .filter(Boolean)
        .forEach((l) => pushTerm("stdout", l));
      data.stderr
        ?.split("\n")
        .filter(Boolean)
        .forEach((l) => pushTerm("stderr", l));
    } catch (err) {
      pushTerm("error", err.message);
    } finally {
      setTermBusy(false);
    }
  }

  // ── Save & Deploy ──────────────────────────────────────────────────────────

  async function saveAndDeploy() {
    if (deploying) return;
    setDeploying(true);
    setDeployLogs([]);
    setPanelTab("deploy");

    const addLog = (type, msg) =>
      setDeployLogs((prev) => [...prev, { type, msg }]);

    addLog("system", "💾 Saving all files and stopping dev server…");

    // stop dev first
    if (sessionId) {
      try {
        await fetch(`${API_BASE}/api/ide/stop/${sessionId}`, {
          method: "POST",
          headers: authHeaders,
        });
        setDevStatus("idle");
        setDevPort(null);
        setSessionId(null);
        setPreviewOpen(false);
      } catch (_) {}
    }

    addLog("system", "🚀 Starting production build…");

    try {
      const res = await fetch(`${API_BASE}/api/ide/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ projectName, files, sessionId }),
      });

      if (!res.ok) throw new Error(await res.text());

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
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
          if (!dat) continue;
          if (
            ["log", "step_start", "step_done", "status", "system"].includes(evt)
          ) {
            addLog(dat.type || evt, dat.message || dat.msg || "");
          }
          if (evt === "done") {
            setDeployedUrl(dat.url);
            setModified(new Set());
            addLog("system", `🚀 Live → ${dat.url}`);
          }
          if (evt === "error") addLog("error", dat.message);
        }
      }
    } catch (err) {
      addLog("error", err.message);
    } finally {
      setDeploying(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const tree = buildTree(files);
  const content = files[active] ?? "";
  const lang = getLang(active);

  const deployLogColor = {
    stdout: "#4ade80",
    stderr: "#f87171",
    system: "#60a5fa",
    error: "#f87171",
    step_start: "#fbbf24",
    step_done: "#4ade80",
  };

  return (
    <div style={s.shell}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;700;900&display=swap');
        *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
        body { overflow:hidden; }
        .hl-k { color:#c792ea; }
        .hl-s { color:#c3e88d; }
        .hl-t { color:#82aaff; }
        .hl-c { color:#546e7a; font-style:italic; }
        .hl-n { color:#f78c6c; }
        .tree-file-row:hover .tree-del { opacity:0.5 !important; }
        .tree-file-row:hover { background:rgba(255,255,255,0.03); }
        @keyframes livepulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(74,222,128,0.4)} 50%{opacity:.8;box-shadow:0 0 0 4px rgba(74,222,128,0)} }
        @keyframes spin { to { transform:rotate(360deg); } }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:3px; }
      `}</style>

      {/* ── TOP BAR ───────────────────────────────────────────────────────── */}
      <header style={s.topBar}>
        <div style={s.topLeft}>
          <button style={s.navBtn} onClick={() => navigate("/dashboard")}>
            ← Dashboard
          </button>
          <span style={s.sep} />
          <span style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>
            ▲
          </span>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            style={s.nameInput}
            title="Project name"
          />
          {modified.size > 0 && (
            <span style={s.dirtyBadge}>{modified.size} unsaved</span>
          )}
        </div>

        <div style={s.topCenter}>
          {devStatus === "idle" || devStatus === "error" ? (
            <button style={s.runBtn} onClick={startDev} disabled={termBusy}>
              ▶ Run Dev Server
            </button>
          ) : devStatus === "starting" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  border: "2px solid #4ade80",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                }}
              />
              <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 700 }}>
                Starting…
              </span>
            </div>
          ) : (
            <div style={s.liveRow}>
              <div style={s.liveDot} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4ade80" }}>
                :{devPort}
              </span>
              <button
                style={s.previewBtn}
                onClick={() => setPreviewOpen((o) => !o)}
              >
                {previewOpen ? "Hide Preview" : "Show Preview"}
              </button>
              <button style={s.stopBtn} onClick={stopDev}>
                ■ Stop
              </button>
            </div>
          )}
        </div>

        <div style={s.topRight}>
          <button
            style={{ ...s.deployBtn, opacity: deploying ? 0.6 : 1 }}
            onClick={saveAndDeploy}
            disabled={deploying}
          >
            {deploying ? "⏳ Building…" : "🚀 Save & Deploy"}
          </button>
        </div>
      </header>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div style={s.body}>
        {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
        <aside style={s.sidebar}>
          <div style={s.sidebarHead}>
            <span style={s.sidebarTitle}>FILES</span>
            <button
              style={s.iconBtn}
              onClick={() => setShowNewFile((v) => !v)}
              title="New file"
            >
              +
            </button>
          </div>

          {showNewFile && (
            <div style={{ padding: "6px 8px" }}>
              <input
                autoFocus
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addFile(newFileName);
                  if (e.key === "Escape") {
                    setShowNewFile(false);
                    setNewFileName("");
                  }
                }}
                placeholder="src/Component.jsx"
                style={s.newFileInput}
              />
            </div>
          )}

          <div style={{ overflowY: "auto", flex: 1 }}>
            <FileTree
              tree={tree}
              activeFile={active}
              onSelect={setActive}
              onDelete={deleteFile}
              modified={modified}
            />
          </div>

          {/* Sidebar bottom — session info */}
          <div style={s.sidebarFoot}>
            <div style={{ fontSize: 10, color: "#4b5563" }}>
              {devStatus === "running" ? (
                <span style={{ color: "#4ade80" }}>● vite :{devPort}</span>
              ) : (
                <span style={{ color: "#4b5563" }}>○ server off</span>
              )}
            </div>
            {deployedUrl && (
              <a
                href={deployedUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 10,
                  color: "#f97316",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                🚀 deployed
              </a>
            )}
          </div>
        </aside>

        {/* ── EDITOR + PREVIEW + TERMINAL ───────────────────────────────── */}
        <div style={s.editorArea}>
          {/* Tab strip */}
          <div style={s.tabStrip}>
            {active && (
              <div style={s.editorTab}>
                <span
                  style={{
                    fontSize: 10,
                    marginRight: 5,
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color: "#888",
                  }}
                >
                  {getIcon(active.split("/").pop())}
                </span>
                <span style={{ fontSize: 12 }}>{active.split("/").pop()}</span>
                {modified.has(active) && (
                  <span
                    style={{
                      marginLeft: 5,
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "#f97316",
                      display: "inline-block",
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Editor row */}
          <div
            style={{
              flex: 1,
              display: "flex",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <CodeEditor
              key={active}
              value={content}
              onChange={handleFileChange}
              language={lang}
            />

            {/* Live preview pane */}
            {previewOpen && devPort && (
              <div style={s.previewPane}>
                <div style={s.previewHead}>
                  <div style={s.liveDot} />
                  <span
                    style={{ fontSize: 11, color: "#4ade80", fontWeight: 700 }}
                  >
                    localhost:{devPort}
                  </span>
                  <button
                    style={{ ...s.iconBtn, marginLeft: "auto" }}
                    onClick={() => {
                      const f = document.getElementById("ide-preview");
                      if (f) f.src = f.src; // force refresh
                    }}
                    title="Refresh"
                  >
                    ↺
                  </button>
                  <button
                    style={s.iconBtn}
                    onClick={() => setPreviewOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <iframe
                  id="ide-preview"
                  title="preview"
                  src={`http://localhost:${devPort}`}
                  style={{ flex: 1, border: "none", background: "#fff" }}
                />
              </div>
            )}
          </div>

          {/* ── BOTTOM PANEL ──────────────────────────────────────────────── */}
          <div style={{ ...s.bottomPanel, height: termH }}>
            {/* Panel toolbar */}
            <div style={s.panelBar}>
              {["terminal", "deploy"].map((tab) => (
                <button
                  key={tab}
                  style={panelTab === tab ? s.panelTabOn : s.panelTabOff}
                  onClick={() => setPanelTab(tab)}
                >
                  {tab === "terminal" ? "Terminal" : "Deploy logs"}
                  {tab === "deploy" && deploying && (
                    <span
                      style={{
                        marginLeft: 6,
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: "#f97316",
                        display: "inline-block",
                      }}
                    />
                  )}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button
                style={s.iconBtn}
                onClick={() =>
                  setTermLines([{ type: "system", text: "Cleared." }])
                }
                title="Clear terminal"
              >
                ⌫
              </button>
              {/* resize handle */}
              <div
                style={s.resizeHandle}
                onMouseDown={(ev) => {
                  const startY = ev.clientY,
                    startH = termH;
                  const onMove = (e) =>
                    setTermH(
                      Math.max(80, Math.min(500, startH - (e.clientY - startY)))
                    );
                  const onUp = () => {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              >
                ⠿
              </div>
            </div>

            {panelTab === "terminal" ? (
              <Terminal
                lines={termLines}
                onCommand={runCommand}
                busy={termBusy}
              />
            ) : (
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "10px 14px",
                  background: "#0b0b0b",
                }}
              >
                {!deployLogs.length && (
                  <div
                    style={{
                      color: "#4b5563",
                      fontFamily: "monospace",
                      fontSize: 12,
                    }}
                  >
                    Deploy logs will appear here after "Save & Deploy".
                  </div>
                )}
                {deployLogs.map((l, i) => (
                  <div
                    key={i}
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      lineHeight: "20px",
                      color: deployLogColor[l.type] || "#9ca3af",
                    }}
                  >
                    <span
                      style={{ opacity: 0.35, fontSize: 10, marginRight: 8 }}
                    >
                      {l.type}
                    </span>
                    {l.msg}
                  </div>
                ))}
                {deployedUrl && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: "12px 16px",
                      background: "rgba(74,222,128,0.08)",
                      borderRadius: 8,
                      border: "1px solid rgba(74,222,128,0.2)",
                    }}
                  >
                    <div
                      style={{
                        color: "#4ade80",
                        fontWeight: 700,
                        fontSize: 13,
                        marginBottom: 4,
                      }}
                    >
                      🚀 Deployed!
                    </div>
                    <a
                      href={deployedUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: "#86efac",
                        fontSize: 12,
                        wordBreak: "break-all",
                      }}
                    >
                      {deployedUrl}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── STATUS BAR ───────────────────────────────────────────────────── */}
      <footer style={s.statusBar}>
        <span
          style={{
            color:
              devStatus === "running"
                ? "#4ade80"
                : devStatus === "error"
                ? "#f87171"
                : "#4b5563",
            fontSize: 11,
          }}
        >
          {devStatus === "running"
            ? `● vite :${devPort}`
            : devStatus === "starting"
            ? "⏳ starting…"
            : devStatus === "error"
            ? "✗ error"
            : "○ stopped"}
        </span>
        <span style={{ color: "#4b5563", fontSize: 11 }}>
          {lang.toUpperCase()}
        </span>
        <span style={{ color: "#4b5563", fontSize: 11 }}>{active}</span>
        <span style={{ color: "#4b5563", fontSize: 11, marginLeft: "auto" }}>
          {files ? `${Object.keys(files).length} files` : ""}
        </span>
        {deployedUrl && (
          <a
            href={deployedUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#f97316", fontSize: 11 }}
          >
            🚀 {deployedUrl}
          </a>
        )}
      </footer>
    </div>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────

const BG = "#0f0f0f";
const BG2 = "#161616";
const BG3 = "#1c1c1c";
const SIDE = "#111111";
const BORD = "rgba(255,255,255,0.06)";
const FONT = "'DM Sans', system-ui, sans-serif";

const s = {
  shell: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: BG,
    color: "#e5e7eb",
    fontFamily: FONT,
    overflow: "hidden",
  },

  topBar: {
    height: 46,
    background: BG2,
    borderBottom: `1px solid ${BORD}`,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    gap: 12,
    flexShrink: 0,
    zIndex: 10,
  },
  topLeft: { display: "flex", alignItems: "center", gap: 10, flex: 1 },
  topCenter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 10,
  },
  topRight: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flex: 1,
  },

  navBtn: {
    padding: "5px 10px",
    background: "transparent",
    border: `1px solid ${BORD}`,
    borderRadius: 6,
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: FONT,
  },
  sep: { width: 1, height: 18, background: BORD },
  nameInput: {
    background: "transparent",
    border: "none",
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: 700,
    width: 140,
    fontFamily: FONT,
    outline: "none",
  },
  dirtyBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: "#f97316",
    background: "rgba(249,115,22,0.1)",
    padding: "2px 8px",
    borderRadius: 999,
  },

  runBtn: {
    padding: "6px 16px",
    background: "rgba(74,222,128,0.1)",
    border: "1px solid rgba(74,222,128,0.2)",
    borderRadius: 6,
    color: "#4ade80",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: FONT,
  },
  liveRow: { display: "flex", alignItems: "center", gap: 10 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#4ade80",
    animation: "livepulse 2s ease infinite",
    flexShrink: 0,
  },
  previewBtn: {
    padding: "4px 10px",
    background: "rgba(96,165,250,0.1)",
    border: "1px solid rgba(96,165,250,0.2)",
    borderRadius: 6,
    color: "#60a5fa",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: FONT,
  },
  stopBtn: {
    padding: "4px 10px",
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.2)",
    borderRadius: 6,
    color: "#f87171",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: FONT,
  },
  deployBtn: {
    padding: "7px 16px",
    background: "#f97316",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: FONT,
    transition: "opacity .2s",
  },

  body: { flex: 1, display: "flex", overflow: "hidden", minHeight: 0 },

  sidebar: {
    width: 200,
    background: SIDE,
    borderRight: `1px solid ${BORD}`,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    overflow: "hidden",
  },
  sidebarHead: {
    height: 34,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 10px",
    borderBottom: `1px solid ${BORD}`,
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 1.5,
    color: "#4b5563",
  },
  sidebarFoot: {
    borderTop: `1px solid ${BORD}`,
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    flexShrink: 0,
  },
  iconBtn: {
    width: 22,
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    color: "#9ca3af",
    fontSize: 14,
    cursor: "pointer",
    borderRadius: 4,
    fontFamily: FONT,
  },
  newFileInput: {
    width: "100%",
    background: BG3,
    border: `1px solid ${BORD}`,
    borderRadius: 4,
    padding: "5px 8px",
    color: "#e5e7eb",
    fontSize: 12,
    fontFamily: "monospace",
    outline: "none",
  },

  editorArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    overflow: "hidden",
  },

  tabStrip: {
    height: 34,
    background: BG2,
    borderBottom: `1px solid ${BORD}`,
    display: "flex",
    alignItems: "stretch",
    flexShrink: 0,
    overflowX: "auto",
  },
  editorTab: {
    display: "flex",
    alignItems: "center",
    padding: "0 14px",
    borderRight: `1px solid ${BORD}`,
    borderBottom: "2px solid #f97316",
    color: "#e5e7eb",
    fontSize: 12,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },

  previewPane: {
    width: "42%",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderLeft: `1px solid ${BORD}`,
    background: "#fff",
  },
  previewHead: {
    height: 34,
    background: BG2,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 10px",
    borderBottom: `1px solid ${BORD}`,
    flexShrink: 0,
  },

  bottomPanel: {
    background: "#0b0b0b",
    borderTop: `1px solid ${BORD}`,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    overflow: "hidden",
  },
  panelBar: {
    height: 30,
    display: "flex",
    alignItems: "center",
    borderBottom: `1px solid ${BORD}`,
    padding: "0 4px",
    gap: 2,
    flexShrink: 0,
  },
  panelTabOn: {
    padding: "0 12px",
    height: 30,
    background: "transparent",
    border: "none",
    borderBottom: "2px solid #f97316",
    color: "#e5e7eb",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: FONT,
    display: "flex",
    alignItems: "center",
  },
  panelTabOff: {
    padding: "0 12px",
    height: 30,
    background: "transparent",
    border: "none",
    color: "#6b7280",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: FONT,
    display: "flex",
    alignItems: "center",
  },
  resizeHandle: {
    padding: "0 8px",
    color: "#374151",
    cursor: "row-resize",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
  },

  statusBar: {
    height: 22,
    background: "#0a0a0a",
    borderTop: `1px solid ${BORD}`,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    gap: 18,
    flexShrink: 0,
  },
};

// editor-specific styles
const e = {
  lineNums: {
    background: BG2,
    color: "#374151",
    fontSize: 12,
    fontFamily: "monospace",
    lineHeight: "20px",
    padding: "12px 10px 12px 12px",
    textAlign: "right",
    userSelect: "none",
    minWidth: 42,
    flexShrink: 0,
    overflowY: "hidden",
  },
  hlLayer: {
    position: "absolute",
    top: 0,
    left: 42,
    right: 0,
    bottom: 0,
    padding: "12px 16px",
    margin: 0,
    overflow: "hidden",
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: "20px",
    whiteSpace: "pre",
    color: "#abb2bf",
    pointerEvents: "none",
    background: "transparent",
    wordBreak: "break-all",
    tabSize: 2,
  },
  textarea: {
    position: "absolute",
    top: 0,
    left: 42,
    right: 0,
    bottom: 0,
    padding: "12px 16px",
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: "20px",
    background: "transparent",
    border: "none",
    color: "transparent",
    caretColor: "#fff",
    resize: "none",
    whiteSpace: "pre",
    overflow: "auto",
    tabSize: 2,
    zIndex: 1,
    outline: "none",
  },
  term: {
    flex: 1,
    overflowY: "auto",
    padding: "10px 14px",
    background: "#0b0b0b",
  },
  treeRow: {
    display: "flex",
    alignItems: "center",
    height: 26,
    cursor: "pointer",
    paddingRight: 8,
    userSelect: "none",
  },
};
