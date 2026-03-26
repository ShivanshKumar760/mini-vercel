import { useEffect, useRef, useState } from "react";
import { getAuthHeaders, clearToken } from "../lib/auth";
import { API_BASE } from "../lib/http";

const STEP_LABELS = [
  { key:"clone",   emoji:"📥", label:"Cloning repository" },
  { key:"install", emoji:"📦", label:"Installing dependencies" },
  { key:"build",   emoji:"🔨", label:"Building project" },
  { key:"serve",   emoji:"🌐", label:"Starting server" },
];

const STEP_KEYWORDS = {
  clone:   ["Cloning repository","cloned"],
  install: ["npm install","Installing dependencies"],
  build:   ["npm run build","Building project"],
  serve:   ["serve","Starting server"],
};

function matchStep(msg) {
  for (const [key, kws] of Object.entries(STEP_KEYWORDS)) {
    if (kws.some(kw => msg.toLowerCase().includes(kw.toLowerCase()))) return key;
  }
  return null;
}

function StepRow({ emoji, label, state }) {
  const stateStyles = {
    idle:    { dot:"rgba(0,0,0,0.15)", text:"rgba(11,11,15,0.4)", badge:null },
    running: { dot:"#f97316",          text:"#0b0b0f",            badge:{ color:"#f97316", label:"running…" } },
    done:    { dot:"#22c55e",          text:"#0b0b0f",            badge:{ color:"#22c55e", label:"✓" } },
    error:   { dot:"#ef4444",          text:"#dc2626",            badge:{ color:"#ef4444", label:"✗ failed" } },
  };
  const st = stateStyles[state] || stateStyles.idle;

  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"7px 0" }}>
      <div style={{
        width:10, height:10, borderRadius:"50%", background:st.dot,
        boxShadow: state==="running" ? "0 0 0 3px rgba(249,115,22,0.2)" : "none",
        flexShrink:0, transition:"all 0.3s",
      }}/>
      <span style={{ fontSize:14 }}>{emoji}</span>
      <span style={{ fontSize:13, color:st.text, fontFamily:"monospace", flex:1 }}>{label}</span>
      {st.badge && (
        <span style={{ fontSize:11, color:st.badge.color, fontWeight:700 }}>{st.badge.label}</span>
      )}
    </div>
  );
}

export default function Deploy({ navigate }) {
  const [name, setName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [logs, setLogs] = useState([]);
  const [steps, setSteps] = useState(Object.fromEntries(STEP_LABELS.map(s => [s.key,"idle"])));
  const [activeStep, setActiveStep] = useState(null);
  const [deployedUrl, setDeployedUrl] = useState(null);
  const [error, setError] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [logs]);
  useEffect(() => {
    if (!getAuthHeaders().Authorization) navigate("/login");
    // eslint-disable-next-line
  }, []);

  function resetState() {
    setLogs([]); setSteps(Object.fromEntries(STEP_LABELS.map(s => [s.key,"idle"])));
    setActiveStep(null); setDeployedUrl(null); setError(null);
  }

  function markStep(key, state) {
    setSteps(prev => ({ ...prev, [key]:state }));
    if (state==="running") setActiveStep(key);
    if (state==="done"||state==="error") setActiveStep(null);
  }

  function pushLog(type, message) {
    setLogs(prev => [...prev, { type, message, id:Date.now()+Math.random() }]);
  }

  function handleSSEEvent(event, data) {
    if (event==="log") {
      pushLog(data.type, data.message);
      const m = matchStep(data.message);
      if (m && data.type==="stdout") setSteps(prev => { if (prev[m]==="idle") markStep(m,"running"); return prev; });
    }
    if (event==="status") {
      if (data.message.toLowerCase().includes("cloning")) markStep("clone","running");
      if (data.message.toLowerCase().includes("cloned")) markStep("clone","done");
      const m = matchStep(data.message); if (m) markStep(m,"running");
    }
    if (event==="step_start") { const m=matchStep(data.message); if(m) markStep(m,"running"); pushLog("system",data.message); }
    if (event==="step_done")  { const m=matchStep(data.message); if(m) markStep(m,"done"); pushLog("system",data.message); }
    if (event==="done") {
      setSteps(Object.fromEntries(STEP_LABELS.map(s=>[s.key,"done"])));
      setDeployedUrl(data.url); setDeploying(false);
      setTimeout(() => navigate("/dashboard"), 1200);
    }
    if (event==="error") { if (activeStep) markStep(activeStep,"error"); setError(data.message); setDeploying(false); }
  }

  async function deploy() {
    if (!name.trim()||!githubUrl.trim()||deploying) return;
    resetState(); setDeploying(true); markStep("clone","running");
    try {
      const response = await fetch(`${API_BASE}/api/projects/create`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", ...getAuthHeaders() },
        body:JSON.stringify({ name, githubUrl }),
      });
      if (!response.ok) {
        if (response.status===401) { clearToken(); navigate("/login"); return; }
        throw new Error((await response.text().catch(()=>"")) || `Error ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream:true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          let evt="message", dat=null;
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) evt=line.slice(7).trim();
            if (line.startsWith("data: ")) { try { dat=JSON.parse(line.slice(6)); } catch { dat={message:line.slice(6)}; } }
          }
          if (dat) handleSSEEvent(evt, dat);
        }
      }
    } catch (err) {
      setError(err?.message||"Connection error"); setDeploying(false);
    }
  }

  const logColor = { stdout:"#16a34a", stderr:"#ea580c", system:"#2563eb" };
  const showPanel = deploying || deployedUrl || error || logs.length > 0;

  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        input:focus { outline:none; border-color:#f97316 !important; }
        ::-webkit-scrollbar { width:5px; } ::-webkit-scrollbar-thumb { background:rgba(0,0,0,0.12); border-radius:4px; }
      `}</style>

      {/* TOP BAR */}
      <header style={s.topBar}>
        <div style={s.brand}>
          <span style={s.brandMark}>▲</span>
          <span style={s.brandText}>VERCELITE</span>
        </div>
        <button style={s.backBtn} onClick={() => navigate("/dashboard")}>← Dashboard</button>
      </header>

      <div style={s.wrap}>
        {/* LEFT: form */}
        <div style={s.formCol}>
          <h1 style={s.heading}>New deployment</h1>
          <p style={s.sub}>Paste a GitHub repo and watch it build live.</p>

          <div style={s.fieldGroup}>
            <div style={s.field}>
              <label style={s.label}>Project name</label>
              <input style={s.input} placeholder="my-app" value={name}
                onChange={e => setName(e.target.value)} disabled={deploying}/>
            </div>
            <div style={s.field}>
              <label style={s.label}>GitHub URL</label>
              <input style={s.input} placeholder="https://github.com/user/repo"
                value={githubUrl} onChange={e => setGithubUrl(e.target.value)} disabled={deploying}/>
            </div>
            <button
              style={deploying ? s.deployBtnBusy : s.deployBtn}
              onClick={deploy} disabled={deploying}
            >
              {deploying ? "Deploying…" : "Deploy →"}
            </button>
          </div>

          {/* Step tracker */}
          {showPanel && (
            <div style={s.stepsCard}>
              {STEP_LABELS.map(step => (
                <StepRow key={step.key} emoji={step.emoji} label={step.label} state={steps[step.key]}/>
              ))}
            </div>
          )}

          {deployedUrl && (
            <div style={s.successCard}>
              <div style={s.successTitle}>🚀 Deployed!</div>
              <a href={deployedUrl} target="_blank" rel="noreferrer" style={s.successLink}>{deployedUrl}</a>
              <div style={s.successHint}>Redirecting to dashboard…</div>
            </div>
          )}

          {error && <div style={s.errorCard}>⚠ {error}</div>}
        </div>

        {/* RIGHT: terminal */}
        {logs.length > 0 && (
          <div style={s.termCol}>
            <div style={s.termBar}>
              <div style={{ display:"flex", gap:6 }}>
                {["#ff5f57","#febc2e","#28c840"].map(c => (
                  <div key={c} style={{ width:12, height:12, borderRadius:"50%", background:c }}/>
                ))}
              </div>
              <span style={s.termTitle}>Build output</span>
            </div>
            <div style={s.termBody}>
              {logs.map(log => (
                <div key={log.id} style={{ ...s.logLine, color:logColor[log.type]||"#555" }}>
                  <span style={s.logBadge}>{log.type}</span>{log.message}
                </div>
              ))}
              <div ref={logsEndRef}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const FONT = "'DM Sans', system-ui, sans-serif";

const s = {
  page: { minHeight:"100vh", background:"#f0ede6", fontFamily:FONT, color:"#0b0b0f" },

  topBar: {
    height:64, background:"#fff", borderBottom:"1px solid rgba(0,0,0,0.08)",
    display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"0 24px", position:"sticky", top:0, zIndex:10,
  },
  brand: { display:"flex", alignItems:"center", gap:10 },
  brandMark: { fontSize:16, fontWeight:900 },
  brandText: { fontSize:14, fontWeight:900, letterSpacing:2 },
  backBtn: {
    padding:"9px 16px", background:"transparent", border:"1px solid rgba(0,0,0,0.1)",
    borderRadius:999, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:FONT,
  },

  wrap: {
    maxWidth:1100, margin:"0 auto", padding:"40px 24px",
    display:"flex", gap:24, alignItems:"flex-start",
  },
  formCol: { width:380, flexShrink:0 },
  heading: { fontSize:30, fontWeight:900, letterSpacing:"-0.03em", marginBottom:8 },
  sub: { fontSize:14, color:"rgba(11,11,15,0.55)", marginBottom:28 },

  fieldGroup: {
    background:"#fff", border:"1px solid rgba(0,0,0,0.08)",
    borderRadius:20, padding:24, marginBottom:16,
    display:"flex", flexDirection:"column", gap:14,
  },
  field: { display:"flex", flexDirection:"column", gap:6 },
  label: { fontSize:11, fontWeight:900, letterSpacing:1, color:"rgba(11,11,15,0.5)", textTransform:"uppercase" },
  input: {
    padding:"11px 14px", background:"#f0ede6",
    border:"1px solid rgba(0,0,0,0.1)", borderRadius:12,
    fontSize:14, color:"#0b0b0f", fontFamily:FONT, transition:"border-color 0.2s",
  },
  deployBtn: {
    padding:"14px", background:"#f97316", color:"#fff", border:"none",
    borderRadius:12, fontWeight:900, fontSize:13, cursor:"pointer",
    fontFamily:FONT, letterSpacing:0.5,
  },
  deployBtnBusy: {
    padding:"14px", background:"#f97316", color:"#fff", border:"none",
    borderRadius:12, fontWeight:900, fontSize:13, cursor:"not-allowed",
    opacity:0.55, fontFamily:FONT,
  },

  stepsCard: {
    background:"#fff", border:"1px solid rgba(0,0,0,0.08)",
    borderRadius:16, padding:"14px 18px", marginBottom:16,
  },
  successCard: {
    background:"#f0fdf4", border:"1px solid #bbf7d0",
    borderRadius:16, padding:"18px 20px",
  },
  successTitle: { fontWeight:900, fontSize:15, marginBottom:6 },
  successLink: { fontSize:13, color:"#15803d", fontWeight:700, wordBreak:"break-all" },
  successHint: { fontSize:12, color:"rgba(11,11,15,0.4)", marginTop:8 },
  errorCard: {
    background:"#fef2f2", border:"1px solid #fecaca",
    borderRadius:16, padding:"16px 20px", color:"#dc2626", fontSize:13,
  },

  termCol: {
    flex:1, background:"#fff", border:"1px solid rgba(0,0,0,0.08)",
    borderRadius:20, overflow:"hidden", minWidth:0,
    position:"sticky", top:80,
  },
  termBar: {
    background:"#f0ede6", borderBottom:"1px solid rgba(0,0,0,0.08)",
    padding:"12px 16px", display:"flex", alignItems:"center", gap:12,
  },
  termTitle: { fontSize:11, fontWeight:700, color:"rgba(11,11,15,0.45)", letterSpacing:0.8 },
  termBody: { padding:"16px", maxHeight:"calc(100vh - 180px)", overflowY:"auto" },
  logLine: {
    fontFamily:"monospace", fontSize:12, lineHeight:1.8,
    whiteSpace:"pre-wrap", wordBreak:"break-all",
  },
  logBadge: { display:"inline-block", marginRight:8, opacity:0.4, fontSize:10, minWidth:40 },
};