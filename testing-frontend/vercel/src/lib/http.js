import { getAuthHeaders } from "./auth";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";
// const API_BASE =
//   import.meta.env.VITE_API_BASE ||
//   "https://treasa-crewneck-dona.ngrok-free.dev";

export { API_BASE };

export async function apiJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...getAuthHeaders(),
    },
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    if (isJson) {
      const payload = await res.json().catch(() => null);
      message = payload?.message || payload?.error || message;
    } else {
      message = await res.text().catch(() => message);
    }
    throw new Error(message);
  }

  if (!isJson) return null;
  return res.json();
}
