/* eslint-disable*/
import { useEffect, useRef, useState } from "react";
import { getAuthHeaders, clearToken } from "../lib/auth";
import { API_BASE } from "../lib/http";
import CodeDeploy from "./Codedeploy";

// ─── Step config ─────────────────────────────────────────────────────────────

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

// ─── Shared sub-components ───────────────────────────────────────────────────

function StepRow({ emoji, label, state }) {
  const stateStyles = {
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
  };
  const st = stateStyles[state] || stateStyles.idle;

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
  const logsEndRef = useRef(null);
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const logColor = {
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
            style={{ ...s.logLine, color: logColor[log.type] || "#555" }}
          >
            <span style={s.logBadge}>{log.type}</span>
            {log.message}
          </div>
        ))}
        <div ref={logsEndRef} />
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
  const [activeStep, setActiveStep] = useState(null);
  const [deployedUrl, setDeployedUrl] = useState(null);
  const [error, setError] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const activeStepRef = useRef(null);

  function resetState() {
    setLogs([]);
    setSteps(Object.fromEntries(STEP_LABELS.map((s) => [s.key, "idle"])));
    setActiveStep(null);
    setDeployedUrl(null);
    setError(null);
  }

  function markStep(key, state) {
    setSteps((prev) => ({ ...prev, [key]: state }));
    if (state === "running") {
      setActiveStep(key);
      activeStepRef.current = key;
    }
    if (state === "done" || state === "error") {
      setActiveStep(null);
      activeStepRef.current = null;
    }
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
      const m = matchStep(data.message);
      if (m && data.type === "stdout")
        setSteps((prev) => {
          if (prev[m] === "idle") markStep(m, "running");
          return prev;
        });
    }
    if (event === "status") {
      if (data.message.toLowerCase().includes("cloning"))
        markStep("clone", "running");
      if (data.message.toLowerCase().includes("cloned"))
        markStep("clone", "done");
      const m = matchStep(data.message);
      if (m) markStep(m, "running");
    }
    if (event === "step_start") {
      const m = matchStep(data.message);
      if (m) markStep(m, "running");
      pushLog("system", data.message);
    }
    if (event === "step_done") {
      const m = matchStep(data.message);
      if (m) markStep(m, "done");
      pushLog("system", data.message);
    }
    if (event === "done") {
      setSteps(Object.fromEntries(STEP_LABELS.map((s) => [s.key, "done"])));
      setDeployedUrl(data.url);
      setDeploying(false);
      setTimeout(() => navigate("/dashboard"), 1200);
    }
    if (event === "error") {
      if (activeStepRef.current) markStep(activeStepRef.current, "error");
      setError(data.message);
      setDeploying(false);
    }
  }

  async function deploy() {
    if (!name.trim() || !githubUrl.trim() || deploying) return;
    resetState();
    setDeploying(true);
    markStep("clone", "running");
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
    }
  }

  const showPanel = deploying || deployedUrl || error || logs.length > 0;

  return (
    <div style={s.twoCol}>
      {/* Form column */}
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

      {/* Terminal column */}
      <TerminalPanel logs={logs} />
    </div>
  );
}

// ─── Tab 2: Drag & Drop Upload ────────────────────────────────────────────────

function UploadDeploy({ navigate }) {
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [logs, setLogs] = useState([]);
  const [steps, setSteps] = useState(
    Object.fromEntries(UPLOAD_STEP_LABELS.map((s) => [s.key, "idle"]))
  );
  const [deployedUrl, setDeployedUrl] = useState(null);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null); // for zip
  const [selectedFiles, setSelectedFiles] = useState([]); // for folder/multi
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
    setSteps((prev) => ({ ...prev, [key]: state }));
  }

  function pushLog(type, message) {
    setLogs((prev) => [
      ...prev,
      { type, message, id: Date.now() + Math.random() },
    ]);
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
        // webkitRelativePath is "dist/assets/main.js" for folder uploads
        // falls back to plain filename for drag-and-drop individual files
        relativePaths.push(f.webkitRelativePath || f.name);
      }
      // Send paths as one JSON field so the backend can reconstruct folders
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

      // Surface backend logs
      if (data.logs?.length) {
        for (const l of data.logs) pushLog(l.type, l.msg);
      }

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
    const arr = Array.from(files);
    setSelectedFiles(arr);
    setSelectedFile(null);
    deployFiles(null, arr);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const items = e.dataTransfer.items;

    if (items) {
      // Check if folder was dropped
      const dtFiles = Array.from(e.dataTransfer.files);
      if (dtFiles.length === 1 && dtFiles[0].name.endsWith(".zip")) {
        handleZipFile(dtFiles[0]);
        return;
      }
      // Multiple files (folder contents)
      if (dtFiles.length > 1) {
        handleFolderFiles(dtFiles);
        return;
      }
    }
    handleZipFile(e.dataTransfer.files?.[0]);
  }

  const uploading = status === "uploading";
  const fileLabel = selectedFile
    ? `📦 ${selectedFile.name}`
    : selectedFiles.length
    ? `📁 ${selectedFiles.length} files selected`
    : null;

  return (
    <div style={s.twoCol}>
      {/* Upload column */}
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

          {/* Drop zone */}
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
                <div style={s.dropSub}>
                  Uploading and starting your container
                </div>
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
                    : "Accepts a .zip file or drag individual dist/ files"}
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

            {/* Hidden inputs */}
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

          {/* Helper note */}
          <div style={s.uploadHint}>
            <span style={{ color: "#f97316", fontWeight: 700 }}>Tip:</span> Run{" "}
            <code style={s.code}>npm run build</code> locally, then zip your{" "}
            <code style={s.code}>dist/</code> folder or drag the files directly.
          </div>
        </div>

        {/* Step tracker */}
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
            <div style={s.successHint}>Redirecting to dashboard…</div>
          </div>
        )}
        {error && <div style={s.errorCard}>⚠ {error}</div>}
      </div>

      {/* Terminal column */}
      <TerminalPanel logs={logs} />
    </div>
  );
}

// ─── Main Deploy Page ─────────────────────────────────────────────────────────

export default function Deploy({ navigate }) {
  const [tab, setTab] = useState("github"); // "github" | "upload"

  useEffect(() => {
    if (!getAuthHeaders().Authorization) navigate("/login");
  }, []);

  // Full-screen takeover for the code tab — render before the normal shell
  if (tab === "code") {
    return <CodeDeploy navigate={navigate} onBack={() => setTab("github")} />;
  }

  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        input:focus { outline: none; border-color: #f97316 !important; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 4px; }
        .tab-btn:hover { background: rgba(249,115,22,0.06) !important; }
      `}</style>

      {/* TOP BAR */}
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
        {/* Page header */}
        <div style={s.pageHead}>
          <div>
            <h1 style={s.heading}>New deployment</h1>
            <p style={s.sub}>
              Deploy from GitHub or upload a pre-built project.
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={s.tabRow}>
          <button
            className="tab-btn"
            style={tab === "github" ? s.tabActive : s.tab}
            onClick={() => setTab("github")}
          >
            <span style={s.tabIcon}>🐙</span>
            <div>
              <div style={s.tabLabel}>GitHub</div>
              <div style={s.tabDesc}>Clone & build from repo</div>
            </div>
            {tab === "github" && <div style={s.tabPill}>Selected</div>}
          </button>

          <button
            className="tab-btn"
            style={tab === "upload" ? s.tabActive : s.tab}
            onClick={() => setTab("upload")}
          >
            <span style={s.tabIcon}>📦</span>
            <div>
              <div style={s.tabLabel}>Upload Build</div>
              <div style={s.tabDesc}>Drop dist/ zip or files</div>
            </div>
            {tab === "upload" && <div style={s.tabPill}>Selected</div>}
          </button>

          <button
            style={tab === "code" ? s.tabActive : s.tab}
            onClick={() => setTab("code")}
          >
            <span style={s.tabIcon}>💻</span>
            <div>
              <div style={s.tabLabel}>Code & Deploy</div>
              <div style={s.tabDesc}>Write React, deploy live</div>
            </div>
          </button>
        </div>

        {/* Tab content */}
        {tab === "github" && <GitHubDeploy navigate={navigate} />}
        {tab === "upload" && <UploadDeploy navigate={navigate} />}
        {tab === "code" && <CodeDeploy navigate={navigate} />}
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

  // ── Tab switcher ──
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
    transition: "border-color 0.2s, box-shadow 0.2s",
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

  // ── Two-col layout ──
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

  // ── Drop zone ──
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

  // ── Steps / success / error ──
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

  // ── Terminal ──
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
