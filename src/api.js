// src/api.js
// Basis-URL: aus .env (VITE_API_URL) oder lokal
const BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_URL &&
    import.meta.env.VITE_API_URL.replace(/\/+$/, "")) ||
  "http://localhost:4000";

// ---------- Helpers ----------
function safeGetUsername() {
  try {
    return localStorage.getItem("username");
  } catch {
    return null;
  }
}
function buildQuery(query) {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ---------- Basis-API ----------
/**
 * Universelle API-Funktion.
 * - Sendet Cookies (credentials: "include") für Sessions.
 * - Setzt automatisch "x-user" (für Fallback/Kompatibilität).
 * - `json` schickt JSON-Body, `query` hängt ?a=b&c=d an.
 */
export async function api(path, options = {}) {
  const {
    method = "GET",
    headers = {},
    body,
    json,   // statt body → automatisch JSON
    query,  // Objekt → URL-Query
  } = options;

  const username = safeGetUsername();
  const finalHeaders = {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...headers,
    "x-user": headers["x-user"] ?? (username || ""),
  };

  const url = BASE + path + buildQuery(query);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: json ? JSON.stringify(json) : body,
      credentials: "include", // wichtig für Session-Cookies
    });
  } catch (e) {
    throw new Error(`Fetch fehlgeschlagen: ${e?.message || e}`);
  }

  if (res.status === 204) return null;

  const ct = res.headers.get("content-type") || "";
  let data;
  try {
    data = ct.includes("application/json") ? await res.json() : await res.text();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      (data && data.message) ||
      (typeof data === "string" && data) ||
      res.statusText ||
      "Request failed";
    throw new Error(msg);
  }
  return data;
}

// Bequeme Helfer
export const apiGet    = (path, opts)        => api(path, { method: "GET",    ...(opts || {}) });
export const apiPost   = (path, json, opts)  => api(path, { method: "POST",   json, ...(opts || {}) });
export const apiPut    = (path, json, opts)  => api(path, { method: "PUT",    json, ...(opts || {}) });
export const apiPatch  = (path, json, opts)  => api(path, { method: "PATCH",  json, ...(opts || {}) });
export const apiDelete = (path, opts)        => api(path, { method: "DELETE", ...(opts || {}) });

/**
 * Datei-Uploads (FormData). Content-Type NICHT setzen – macht der Browser.
 * Beispiel:
 *   const fd = new FormData();
 *   fd.append("anleitung", file);
 *   await apiUpload("/api/Technik/recurring/upload", fd);
 */
export async function apiUpload(path, formData, options = {}) {
  const username = safeGetUsername();
  let res;
  try {
    res = await fetch(BASE + path, {
      method: options.method || "POST",
      headers: {
        ...(options.headers || {}),
        "x-user": (options.headers && options.headers["x-user"]) || username || "",
      },
      body: formData,
      credentials: "include",
    });
  } catch (e) {
    throw new Error(`Upload fehlgeschlagen: ${e?.message || e}`);
  }

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = (data && data.message) || res.statusText || "Upload failed";
    throw new Error(msg);
  }
  return data;
}

// ---------- Komfort-Wrapper (passend zu deinem Backend) ----------

// Auth
export const Auth = {
  async login(username, password) {
    const data = await api("/api/login", { method: "POST", json: { username, password } });
    try { localStorage.setItem("username", data.username || username); } catch {}
    return data;
  },
  register(username, password) {
    return api("/api/register", { method: "POST", json: { username, password } });
  },
  me() {
    return api("/api/users/me");
  },
  async logout() {
    try { await api("/api/logout", { method: "POST" }); } catch {}
    try { localStorage.removeItem("username"); } catch {}
  },
};

// Admin: Benutzer
export const Users = {
  list() {
    return api("/api/users");
  },
  create({ username, password, isAdmin }) {
    return api("/api/users", { method: "POST", json: { username, password, isAdmin: !!isAdmin } });
  },
  setAdmin(username, isAdmin) {
    return api(`/api/users/${encodeURIComponent(username)}/admin`, {
      method: "PATCH",
      json: { isAdmin: !!isAdmin },
    });
  },
  setRole(username, role) {
    return api(`/api/users/${encodeURIComponent(username)}/role`, {
      method: "PATCH",
      json: { role },
    });
  },
  resetPassword(username, newPassword) {
    return api(`/api/users/${encodeURIComponent(username)}/password`, {
      method: "PATCH",
      json: { newPassword },
    });
  },
  remove(username) {
    return api(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE" });
  },
  setMustChange(username, mustChange) {
    return api(`/api/users/${encodeURIComponent(username)}/must-change`, {
      method: "PATCH",
      json: { mustChange: !!mustChange },
    });
  },
  
};

// Listen: Tasks / Meldungen
function toFormData(entry = {}, files = []) {
  const fd = new FormData();
  fd.append("eintrag", JSON.stringify(entry));
  for (const f of files || []) {
    if (f) fd.append("anhangDateien", f); // Feldname wie im Backend
  }
  return fd;
}
export const Data = {
  list(abteilung, typ, { day, sort, status } = {}) {
    return api(`/api/${encodeURIComponent(abteilung)}/${encodeURIComponent(typ)}`, {
      query: { day, sort, status },
    });
  },
  create(abteilung, typ, entry, files) {
    return apiUpload(
      `/api/${encodeURIComponent(abteilung)}/${encodeURIComponent(typ)}`,
      toFormData(entry, files)
    );
  },
  update(abteilung, typ, idOrIndex, update, files) {
    return apiUpload(
      `/api/${encodeURIComponent(abteilung)}/${encodeURIComponent(typ)}/${encodeURIComponent(idOrIndex)}`,
      toFormData(update, files),
      { method: "PUT" }
    );
  },
  remove(abteilung, typ, idOrIndex) {
    return api(
      `/api/${encodeURIComponent(abteilung)}/${encodeURIComponent(typ)}/${encodeURIComponent(idOrIndex)}`,
      { method: "DELETE" }
    );
  },
  toggleComplete(abteilung, typ, idOrIndex, { completed, erledigtVon } = {}) {
    return api(
      `/api/${encodeURIComponent(abteilung)}/${encodeURIComponent(typ)}/${encodeURIComponent(idOrIndex)}/complete`,
      { method: "PATCH", json: { completed, erledigtVon } }
    );
  },
  addNote(abteilung, typ, idOrIndex, { autor, text }) {
    return api(
      `/api/${encodeURIComponent(abteilung)}/${encodeURIComponent(typ)}/${encodeURIComponent(idOrIndex)}/notiz`,
      { method: "POST", json: { autor, text } }
    );
  },
  forward(abteilung, typ, idOrIndex, zielAbteilung) {
    return api(
      `/api/${encodeURIComponent(abteilung)}/${encodeURIComponent(typ)}/${encodeURIComponent(idOrIndex)}/weiterleiten`,
      { method: "PUT", json: { zielAbteilung } }
    );
  },
};

// Recurring (Vorlagen)
export const Recurring = {
  list(abteilung) {
    return api(`/api/${encodeURIComponent(abteilung)}/recurring`);
  },
  create(abteilung, data) {
    return api(`/api/${encodeURIComponent(abteilung)}/recurring`, {
      method: "POST",
      json: data,
    });
  },
  update(abteilung, id, data) {
    return api(`/api/${encodeURIComponent(abteilung)}/recurring/${encodeURIComponent(id)}`, {
      method: "PUT",
      json: data,
    });
  },
  remove(abteilung, id) {
    return api(`/api/${encodeURIComponent(abteilung)}/recurring/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  materializeNow(abteilung, { force = false } = {}) {
    return api(`/api/${encodeURIComponent(abteilung)}/recurring/materialize-now`, {
      method: "POST",
      query: { force },
    });
  },
};

// Demo-Seed
export const Seed = {
  run({ reset = true, force = true } = {}) {
    return api("/api/seed", { method: "POST", query: { reset, force } });
  },
};

// optionaler Default-Export (falls du irgendwo `import api from "./api"` verwendest)
export default {
  api,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  apiUpload,
  Auth,
  Users,
  Data,
  Recurring,
  Seed,
};
