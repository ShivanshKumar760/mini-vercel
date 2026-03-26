import { useEffect, useMemo, useState } from "react";
import { getAuthHeaders, clearToken } from "../lib/auth";
import { apiJson } from "../lib/http";

export default function Dashboard({ navigate }) {
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const authHeaders = useMemo(() => getAuthHeaders(), []);

  async function loadProjects() {
    setBusy(true);
    setError(null);
    try {
      const data = await apiJson("/api/projects", { method:"GET", headers:authHeaders });
      const list = data?.projects || [];
      setProjects(list);
      if (!activeId && list.length) setActiveId(list[0]._id);
    } catch (err) {
      const msg = String(err?.message || "");
      if (["unauthorized","no token","token","expired"].some(k => msg.toLowerCase().includes(k))) {
        clearToken(); navigate("/login"); return;
      }
      setError(msg || "Failed to load projects");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!authHeaders.Authorization) { navigate("/login"); return; }
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={s.shell}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        .proj-btn:hover { background: rgba(249,115,22,0.06) !important; }
      `}</style>

      {/* TOP BAR */}
      <header style={s.topBar}>
        <div style={s.brand}>
          <span style={s.brandMark}>▲</span>
          <span style={s.brandText}>VERCELITE</span>
        </div>
        <div style={s.topActions}>
          <button style={s.deployBtn} onClick={() => navigate("/deploy")}>
            + Deploy
          </button>
          <button style={s.ghostBtn} onClick={() => { clearToken(); navigate("/"); }}>
            Log out
          </button>
        </div>
      </header>

      <div style={s.body}>
        {/* SIDEBAR */}
        <aside style={s.sidebar}>
          <div style={s.sideTitle}>Projects</div>
          {busy && <div style={s.muted}>Loading...</div>}
          {error && <div style={s.errText}>⚠ {error}</div>}
          <div style={s.projList}>
            {projects.map(p => (
              <button
                key={p._id}
                className="proj-btn"
                type="button"
                onClick={() => setActiveId(p._id)}
                style={p._id === activeId ? s.projItemActive : s.projItem}
              >
                <span style={s.projDot(p._id === activeId)} />
                <span style={s.projName}>{p.name}</span>
              </button>
            ))}
            {!projects.length && !busy && (
              <div style={s.muted}>No projects yet.</div>
            )}
          </div>
        </aside>

        {/* MAIN GRID */}
        <main style={s.main}>
          {projects.length > 0 ? (
            <div style={s.grid}>
              {projects.map(p => (
                <ProjectCard
                  key={p._id}
                  project={p}
                  active={p._id === activeId}
                  onSelect={() => setActiveId(p._id)}
                />
              ))}
            </div>
          ) : !busy && (
            <div style={s.empty}>
              <div style={s.emptyIcon}>▲</div>
              <div style={s.emptyTitle}>No deployments yet</div>
              <div style={s.emptyDesc}>Click "Deploy" to ship your first project.</div>
              <button style={s.emptyBtn} onClick={() => navigate("/deploy")}>
                Deploy now →
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ProjectCard({ project, active, onSelect }) {
  return (
    <div
      style={active ? s.cardActive : s.card}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onSelect()}
    >
      <div style={s.cardTop}>
        <div style={s.cardName}>{project.name}</div>
        <a href={project.url} target="_blank" rel="noreferrer" style={s.openBtn}
           onClick={e => e.stopPropagation()}>
          Open ↗
        </a>
      </div>
      <div style={s.previewFrame}>
        <iframe title={project.name} src={project.url} style={s.iframe} />
      </div>
      <div style={s.cardMeta}>
        <div style={s.metaChip}>
          <span style={s.metaLabel}>Subdomain</span>
          <span style={s.metaVal}>{project.subdomain}</span>
        </div>
        <div style={s.metaChip}>
          <span style={s.metaLabel}>Repo</span>
          <a href={project.githubUrl} target="_blank" rel="noreferrer"
             style={s.metaLink} onClick={e => e.stopPropagation()}>
            GitHub ↗
          </a>
        </div>
      </div>
    </div>
  );
}

const FONT = "'DM Sans', system-ui, sans-serif";

const s = {
  shell: { minHeight:"100vh", background:"#f0ede6", fontFamily:FONT, color:"#0b0b0f" },

  topBar: {
    height:64, background:"#fff", borderBottom:"1px solid rgba(0,0,0,0.08)",
    display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"0 24px", position:"sticky", top:0, zIndex:10,
  },
  brand: { display:"flex", alignItems:"center", gap:10 },
  brandMark: { fontSize:16, fontWeight:900 },
  brandText: { fontSize:14, fontWeight:900, letterSpacing:2 },
  topActions: { display:"flex", gap:10 },
  deployBtn: {
    padding:"9px 18px", background:"#f97316", color:"#fff", border:"none",
    borderRadius:999, fontWeight:900, fontSize:13, cursor:"pointer", fontFamily:FONT,
  },
  ghostBtn: {
    padding:"9px 18px", background:"transparent",
    border:"1px solid rgba(0,0,0,0.1)", borderRadius:999,
    fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:FONT,
  },

  body: { display:"flex", gap:0 },
  sidebar: {
    width:240, background:"#fff", borderRight:"1px solid rgba(0,0,0,0.08)",
    padding:20, height:"calc(100vh - 64px)", overflowY:"auto",
    position:"sticky", top:64, flexShrink:0,
  },
  sideTitle: { fontSize:11, fontWeight:900, letterSpacing:1.5, color:"rgba(11,11,15,0.4)", marginBottom:14, textTransform:"uppercase" },
  muted: { fontSize:13, color:"rgba(11,11,15,0.4)" },
  errText: { fontSize:13, color:"#dc2626" },
  projList: { display:"flex", flexDirection:"column", gap:4 },
  projItem: {
    display:"flex", alignItems:"center", gap:10,
    padding:"10px 12px", borderRadius:10,
    background:"transparent", border:"none",
    cursor:"pointer", textAlign:"left", width:"100%",
    fontFamily:FONT, transition:"background 0.15s",
  },
  projItemActive: {
    display:"flex", alignItems:"center", gap:10,
    padding:"10px 12px", borderRadius:10,
    background:"rgba(249,115,22,0.08)",
    border:"none", cursor:"pointer", textAlign:"left", width:"100%", fontFamily:FONT,
  },
  projDot: (active) => ({
    width:8, height:8, borderRadius:"50%",
    background: active ? "#f97316" : "rgba(0,0,0,0.18)",
    flexShrink:0,
  }),
  projName: { fontSize:13, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },

  main: { flex:1, padding:24, minWidth:0 },
  grid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:16 },

  card: {
    background:"#fff", border:"1px solid rgba(0,0,0,0.08)", borderRadius:20,
    padding:16, cursor:"pointer", transition:"box-shadow 0.2s",
    boxShadow:"0 2px 8px rgba(0,0,0,0.03)",
  },
  cardActive: {
    background:"#fff", border:"1px solid #f97316", borderRadius:20,
    padding:16, cursor:"pointer",
    boxShadow:"0 8px 24px rgba(249,115,22,0.12)",
  },
  cardTop: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 },
  cardName: { fontWeight:900, fontSize:14 },
  openBtn: {
    fontSize:12, fontWeight:700, color:"#f97316",
    background:"rgba(249,115,22,0.08)", padding:"5px 10px", borderRadius:999,
  },
  previewFrame: { borderRadius:12, overflow:"hidden", border:"1px solid rgba(0,0,0,0.07)", marginBottom:12 },
  iframe: { width:"100%", height:172, border:0, background:"#f0ede6", display:"block" },
  cardMeta: { display:"flex", gap:10 },
  metaChip: {
    flex:1, background:"#f0ede6", borderRadius:10, padding:"10px 12px",
    display:"flex", flexDirection:"column", gap:3,
  },
  metaLabel: { fontSize:10, fontWeight:700, letterSpacing:0.8, color:"rgba(11,11,15,0.45)", textTransform:"uppercase" },
  metaVal: { fontSize:12, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  metaLink: { fontSize:12, fontWeight:700, color:"#f97316" },

  empty: {
    height:"calc(100vh - 112px)", display:"flex", flexDirection:"column",
    alignItems:"center", justifyContent:"center", gap:12,
  },
  emptyIcon: { fontSize:36, marginBottom:8 },
  emptyTitle: { fontSize:20, fontWeight:900 },
  emptyDesc: { fontSize:14, color:"rgba(11,11,15,0.5)" },
  emptyBtn: {
    marginTop:8, padding:"12px 24px", background:"#f97316", color:"#fff",
    border:"none", borderRadius:999, fontWeight:900, cursor:"pointer", fontFamily:FONT,
  },
};