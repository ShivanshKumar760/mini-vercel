import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Deploy from "./pages/Deploy";

function normalizePath(path) {
  if (!path) return "/";
  if (!path.startsWith("/")) return `/${path}`;
  return path;
}

export default function App() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const onPop = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(to) {
    const next = normalizePath(to);
    if (next === path) return;
    window.history.pushState({}, "", next);
    setPath(next);
  }

  if (path === "/login") return <Login navigate={navigate} />;
  if (path === "/dashboard") return <Dashboard navigate={navigate} />;
  if (path === "/deploy") return <Deploy navigate={navigate} />;
  return <Landing navigate={navigate} />;
}

