import { useEffect } from "react";
import { getToken } from "../lib/auth";
import DeployAnimation from "./DeployAnimation";
import DeployPipeline from "./DeployPipeline";

export default function Landing({ navigate }) {
  useEffect(() => {
    const token = getToken();
    if (token) navigate("/dashboard");
  }, [navigate]);

  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0ede6; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        .hero-h1 { animation: fadeUp 0.7s ease both; }
        .hero-p  { animation: fadeUp 0.7s 0.12s ease both; }
        .hero-actions { animation: fadeUp 0.7s 0.22s ease both; }
        .hero-trusted { animation: fadeUp 0.7s 0.32s ease both; }
        a { text-decoration: none; }
        nav a:hover { opacity: 0.7; }
      `}</style>

      {/* NAV */}
      <header style={s.nav}>
        <div style={s.navInner}>
          <div style={s.logo}>
            <span style={s.logoMark}>▲</span>
            <span style={s.logoText}>VERCELITE</span>
          </div>

          <nav style={s.navLinks}>
            {["Product", "Solutions", "Developers", "Pricing", "Blog"].map(
              (l) => (
                <a key={l} style={s.navLink} href="#">
                  {l}
                </a>
              )
            )}
          </nav>

          <div style={s.navRight}>
            {/* ✅ Fixed: onClick correctly calls navigate("/login") */}
            <button style={s.logInBtn} onClick={() => navigate("/login")}>
              LOG IN
            </button>
            <button style={s.talkBtn} onClick={() => navigate("/login")}>
              TALK TO US
            </button>
          </div>
        </div>
      </header>

      <main style={s.main}>
        {/* PILL */}
        <div style={s.pillRow}>
          <div style={s.pill}>
            <span style={s.pillNew}>New:</span>
            <span>Mini Vercel + GitHub Deploy = faster shipping →</span>
          </div>
        </div>

        {/* HERO */}
        <section style={s.hero}>
          <h1 className="hero-h1" style={s.h1}>
            DEPLOY FOR
            <br />
            DEVELOPERS
          </h1>
          <p className="hero-p" style={s.heroP}>
            Deploy GitHub projects with live Docker logs and a private
            dashboard.
            <br />
            Build better apps — ship in minutes, not days.
          </p>
          <div className="hero-actions" style={s.heroActions}>
            <button style={s.primaryBtn} onClick={() => navigate("/login")}>
              GET STARTED
            </button>
            <button style={s.secondaryBtn} onClick={() => navigate("/login")}>
              READ DOCS
            </button>
          </div>

          <div className="hero-trusted" style={s.trustedWrap}>
            <div style={s.trustedLabel}>
              TRUSTED BY
              <br />
              TOP TEAMS
            </div>
            {["CURSOR", "shopify", "runway", "Dropbox", "yelp*"].map((b) => (
              <div key={b} style={s.brandCell}>
                {b}
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES */}
        <section style={s.section}>
          <h2 style={s.sectionH}>What is VercelLite?</h2>
          <p style={s.sectionP}>
            A lightweight deployment dashboard. Paste a GitHub repo, click
            deploy, and watch Docker build your app — logs streaming live to
            your screen.
          </p>
          <div style={s.featureGrid}>
            {[
              {
                title: "Live logs",
                desc: "See every step — clone, install, build, serve — in real-time as Docker runs.",
              },
              {
                title: "Private projects",
                desc: "JWT auth ties each project to your account. Only you can see your deployments.",
              },
              {
                title: "Fast Docker deploy",
                desc: "Runs builds inside containers to keep environments consistent and isolated.",
              },
            ].map((f) => (
              <div key={f.title} style={s.featureCard}>
                <div style={s.featureDot} />
                <div style={s.featureTitle}>{f.title}</div>
                <div style={s.featureDesc}>{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* TECH */}
        <section style={s.section}>
          <h2 style={s.sectionH}>Tech stack</h2>
          <div style={s.chipRow}>
            {[
              "React + Vite",
              "Express API",
              "JWT Auth",
              "MongoDB",
              "Docker",
              "SSE Logs",
            ].map((t) => (
              <div key={t} style={s.chip}>
                <span style={s.chipDot} />
                {t}
              </div>
            ))}
          </div>
        </section>

        {/* FLOW */}
        {/* <section style={s.section}>
          <h2 style={s.sectionH}>Modern deploy flow</h2>
          <p style={s.sectionP}>Clone → build in Docker → expose URL while streaming every log line back to your browser.</p>
          <div style={s.flowCard}>
            <div style={s.flowSteps}>
              {[
                { n:"01", label:"UI", sub:"Deploy form" },
                { n:"02", label:"Backend API", sub:"Auth + validate" },
                { n:"03", label:"Clone repo", sub:"git clone" },
                { n:"04", label:"Docker build", sub:"install → build → serve" },
              ].map((step, i, arr) => (
                <div key={step.n} style={{ display:"flex", alignItems:"center", gap:0, flex:1 }}>
                  <div style={s.flowStep}>
                    <div style={s.flowN}>{step.n}</div>
                    <div style={s.flowLabel}>{step.label}</div>
                    <div style={s.flowSub}>{step.sub}</div>
                  </div>
                  {i < arr.length-1 && <div style={s.flowArrow}>→</div>}
                </div>
              ))}
            </div>
            <div style={s.flowSSE}>
              <div style={s.flowSSELeft}>
                <div style={s.flowSSETitle}>05 — SSE: Stream logs back to UI</div>
                <div style={s.flowSSESub}>The backend emits <code style={s.code}>status</code> and <code style={s.code}>log</code> events while Docker runs. When done, returns the live app URL.</div>
              </div>
              <div style={s.liveBadge}>LIVE URL ↗</div>
            </div>
          </div>
        </section> */}

        <section style={s.section}>
          <h2 style={s.sectionH}>See it deploy, live</h2>
          <p style={s.sectionP}>
            Paste a GitHub URL and watch your project move through the pipeline
            — clone, Docker build, npm install, serve.
          </p>
          <DeployAnimation />
        </section>

        <section
          style={{
            marginTop: "20px",
          }}
        >
          <DeployPipeline />
        </section>
      </main>
    </div>
  );
}

const FONT = "'DM Sans', system-ui, sans-serif";

const s = {
  page: {
    minHeight: "100vh",
    background: "#f0ede6",
    color: "#0b0b0f",
    fontFamily: FONT,
  },

  nav: {
    height: 72,
    background: "#f0ede6",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  navInner: {
    maxWidth: 1160,
    margin: "0 auto",
    padding: "0 24px",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
  },
  logo: { display: "flex", alignItems: "center", gap: 10 },
  logoMark: { fontSize: 18, fontWeight: 900 },
  logoText: { fontSize: 16, fontWeight: 900, letterSpacing: 2 },
  navLinks: { display: "flex", alignItems: "center", gap: 22 },
  navLink: {
    color: "#0b0b0f",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  navRight: { display: "flex", alignItems: "center", gap: 12 },
  logInBtn: {
    background: "transparent",
    border: "none",
    color: "#0b0b0f",
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
    letterSpacing: 0.5,
    fontFamily: FONT,
  },
  talkBtn: {
    background: "#f97316",
    border: "none",
    color: "#fff",
    padding: "10px 20px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
    letterSpacing: 0.5,
    fontFamily: FONT,
  },

  main: { maxWidth: 1160, margin: "0 auto", padding: "40px 24px 80px" },

  pillRow: { display: "flex", justifyContent: "center", marginBottom: 32 },
  pill: {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 999,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 700,
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  pillNew: { color: "#f97316", fontWeight: 900 },

  hero: { textAlign: "center", paddingBottom: 8 },
  h1: {
    fontSize: "clamp(56px,9vw,108px)",
    fontWeight: 900,
    lineHeight: 0.95,
    letterSpacing: "-0.04em",
    marginBottom: 24,
  },
  heroP: {
    fontSize: 16,
    lineHeight: 1.7,
    color: "rgba(11,11,15,0.65)",
    maxWidth: 560,
    margin: "0 auto 28px",
  },
  heroActions: {
    display: "flex",
    gap: 12,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  primaryBtn: {
    padding: "14px 28px",
    background: "#f97316",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
    letterSpacing: 1,
    fontFamily: FONT,
  },
  secondaryBtn: {
    padding: "14px 28px",
    background: "transparent",
    color: "#0b0b0f",
    border: "1px solid rgba(0,0,0,0.18)",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
    letterSpacing: 1,
    fontFamily: FONT,
  },

  trustedWrap: {
    margin: "44px auto 0",
    maxWidth: 960,
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 20,
    display: "flex",
    alignItems: "stretch",
    overflow: "hidden",
  },
  trustedLabel: {
    fontSize: 11,
    fontWeight: 900,
    color: "#666",
    lineHeight: 1.4,
    padding: "20px 22px",
    borderRight: "1px solid rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    minWidth: 120,
  },
  brandCell: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: 15,
    padding: "18px 10px",
    borderRight: "1px solid rgba(0,0,0,0.08)",
  },

  section: { marginTop: 64 },
  sectionH: {
    fontSize: 32,
    fontWeight: 900,
    letterSpacing: "-0.03em",
    marginBottom: 12,
  },
  sectionP: {
    fontSize: 14,
    color: "rgba(11,11,15,0.6)",
    lineHeight: 1.75,
    maxWidth: 680,
    marginBottom: 24,
  },

  featureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: 14,
  },
  featureCard: {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    padding: "22px 20px",
  },
  featureDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#f97316",
    marginBottom: 14,
  },
  featureTitle: { fontWeight: 900, fontSize: 15, marginBottom: 8 },
  featureDesc: { fontSize: 13, color: "rgba(11,11,15,0.6)", lineHeight: 1.7 },

  chipRow: { display: "flex", flexWrap: "wrap", gap: 10 },
  chip: {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 999,
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  chipDot: { width: 8, height: 8, borderRadius: "50%", background: "#22c55e" },

  flowCard: {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 20,
    overflow: "hidden",
  },
  flowSteps: {
    display: "flex",
    alignItems: "stretch",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
  },
  flowStep: { flex: 1, padding: "22px 20px" },
  flowN: {
    fontSize: 11,
    fontWeight: 900,
    color: "#f97316",
    letterSpacing: 1,
    marginBottom: 6,
  },
  flowLabel: { fontSize: 15, fontWeight: 900, marginBottom: 4 },
  flowSub: { fontSize: 12, color: "rgba(11,11,15,0.5)" },
  flowArrow: {
    fontSize: 20,
    color: "rgba(0,0,0,0.18)",
    display: "flex",
    alignItems: "center",
    paddingBottom: 8,
    flexShrink: 0,
  },
  flowSSE: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "22px 24px",
    gap: 20,
  },
  flowSSELeft: { flex: 1 },
  flowSSETitle: { fontWeight: 900, fontSize: 14, marginBottom: 6 },
  flowSSESub: { fontSize: 13, color: "rgba(11,11,15,0.55)", lineHeight: 1.6 },
  code: {
    fontFamily: "monospace",
    background: "rgba(0,0,0,0.06)",
    padding: "1px 6px",
    borderRadius: 4,
  },
  liveBadge: {
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.4)",
    color: "#15803d",
    padding: "12px 18px",
    borderRadius: 12,
    fontWeight: 900,
    fontSize: 13,
    whiteSpace: "nowrap",
  },
};
