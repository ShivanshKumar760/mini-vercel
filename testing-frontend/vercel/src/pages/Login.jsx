import { useMemo, useState } from "react";
import { apiJson } from "../lib/http";
import { clearToken, setToken } from "../lib/auth";

export default function Login({ navigate }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submitLabel = useMemo(() => (mode === "login" ? "LOG IN" : "CREATE ACCOUNT"), [mode]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setBusy(true);
    setError(null);
    clearToken();
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const data = await apiJson(endpoint, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      navigate("/dashboard");
    } catch (err) {
      setError(err?.message || "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        .login-card { animation: fadeUp 0.5s ease both; }
        input:focus { outline: none; border-color: #f97316 !important; }
      `}</style>

      {/* Back to home */}
      <button style={s.backBtn} onClick={() => navigate("/")}>
        ← Back
      </button>

      <div className="login-card" style={s.card}>
        <div style={s.logoRow}>
          <span style={s.logoMark}>▲</span>
          <span style={s.logoText}>VERCELITE</span>
        </div>

        <h1 style={s.heading}>
          {mode === "login" ? "Welcome back" : "Create account"}
        </h1>
        <p style={s.sub}>
          {mode === "login"
            ? "Deploy your projects from your dashboard."
            : "Start deploying GitHub repos in minutes."}
        </p>

        {/* Toggle */}
        <div style={s.tabs}>
          <button
            type="button"
            style={mode === "login" ? s.tabActive : s.tab}
            onClick={() => { setMode("login"); setError(null); }}
          >
            Log in
          </button>
          <button
            type="button"
            style={mode === "register" ? s.tabActive : s.tab}
            onClick={() => { setMode("register"); setError(null); }}
          >
            Register
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ width:"100%" }}>
          <div style={s.field}>
            <label style={s.label}>Email address</label>
            <input
              style={s.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>Password</label>
            <input
              style={s.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          <button type="submit" style={busy ? s.submitBusy : s.submit} disabled={busy}>
            {busy ? "Please wait..." : submitLabel}
          </button>

          {error && <div style={s.errorBox}>⚠ {error}</div>}
        </form>

        <div style={s.footer}>
          JWT token stored locally in your browser.
        </div>
      </div>
    </div>
  );
}

const FONT = "'DM Sans', system-ui, sans-serif";

const s = {
  page: {
    minHeight:"100vh", background:"#f0ede6", display:"flex",
    alignItems:"center", justifyContent:"center",
    fontFamily:FONT, padding:20, position:"relative",
  },
  backBtn: {
    position:"absolute", top:20, left:24,
    background:"transparent", border:"none", fontWeight:700,
    fontSize:13, cursor:"pointer", color:"#0b0b0f", fontFamily:FONT,
    letterSpacing:0.3,
  },
  card: {
    width:"100%", maxWidth:460, background:"#fff",
    border:"1px solid rgba(0,0,0,0.08)", borderRadius:24,
    padding:"36px 32px", boxShadow:"0 20px 40px rgba(0,0,0,0.06)",
    display:"flex", flexDirection:"column", alignItems:"flex-start", gap:0,
  },
  logoRow: { display:"flex", alignItems:"center", gap:10, marginBottom:28 },
  logoMark: { fontSize:18, fontWeight:900 },
  logoText: { fontSize:14, fontWeight:900, letterSpacing:2 },
  heading: { fontSize:28, fontWeight:900, letterSpacing:"-0.03em", marginBottom:6 },
  sub: { fontSize:14, color:"rgba(11,11,15,0.55)", marginBottom:24, lineHeight:1.5 },

  tabs: { display:"flex", width:"100%", marginBottom:22, background:"#f0ede6", borderRadius:12, padding:4 },
  tab: {
    flex:1, padding:"10px 0", background:"transparent", border:"none",
    fontWeight:700, fontSize:13, cursor:"pointer", borderRadius:8,
    fontFamily:FONT, color:"rgba(11,11,15,0.55)", letterSpacing:0.3,
  },
  tabActive: {
    flex:1, padding:"10px 0", background:"#fff",
    border:"1px solid rgba(0,0,0,0.08)", borderRadius:8,
    fontWeight:900, fontSize:13, cursor:"pointer",
    fontFamily:FONT, color:"#0b0b0f", letterSpacing:0.3,
    boxShadow:"0 2px 8px rgba(0,0,0,0.06)",
  },

  field: { display:"flex", flexDirection:"column", gap:6, marginBottom:14, width:"100%" },
  label: { fontSize:12, fontWeight:700, letterSpacing:0.5, color:"rgba(11,11,15,0.7)" },
  input: {
    width:"100%", padding:"12px 14px",
    background:"#f0ede6", border:"1px solid rgba(0,0,0,0.1)",
    borderRadius:12, fontSize:14, color:"#0b0b0f",
    fontFamily:FONT, transition:"border-color 0.2s",
  },
  submit: {
    width:"100%", marginTop:6, padding:"14px",
    background:"#f97316", border:"none", color:"#fff",
    borderRadius:12, fontWeight:900, fontSize:13,
    cursor:"pointer", letterSpacing:1, fontFamily:FONT,
  },
  submitBusy: {
    width:"100%", marginTop:6, padding:"14px",
    background:"#f97316", border:"none", color:"#fff",
    borderRadius:12, fontWeight:900, fontSize:13,
    cursor:"not-allowed", opacity:0.55, letterSpacing:1, fontFamily:FONT,
  },
  errorBox: {
    marginTop:14, background:"#fef2f2", border:"1px solid #fecaca",
    borderRadius:10, padding:"12px 14px", color:"#dc2626", fontSize:13, width:"100%",
  },
  footer: {
    marginTop:20, paddingTop:16, borderTop:"1px solid rgba(0,0,0,0.07)",
    fontSize:12, color:"rgba(11,11,15,0.45)", width:"100%",
  },
};