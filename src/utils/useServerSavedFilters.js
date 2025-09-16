import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Dieser Hook speichert/liest Filter-Einstellungen pro Benutzer + Scope
 * serverseitig (über /api/users/:username/prefs) und cached zusätzlich
 * in localStorage. Komplett in JS (kein TypeScript).
 *
 * Rückgabewerte:
 *  - filters, setFilters
 *  - loading, error
 *  - reset()      → auf Defaults zurücksetzen
 *  - saveNow()    → sofort serverseitig speichern (ohne Debounce)
 *  - lastSavedAt  → ISO-String des letzten erfolgreichen Saves (oder null)
 */

const BASE_DEFAULTS = {
  status: "alle",   // "alle" | "offen" | "erledigt"
  kategorie: "alle",
  date: "all",      // "all" | "today" | "yesterday" | "last7"
  sort: "desc",     // "asc" | "desc"
};

function makeDefaults(overrides) {
  return { ...BASE_DEFAULTS, ...(overrides || {}) };
}

function lsKey(username, scope) {
  return `checkbell:prefs:${username}:${scope}`;
}

async function fetchJSON(url, init) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init && init.headers ? init.headers : {}) },
    ...(init || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

function cacheLocal(username, scope, filters, v) {
  try {
    const payload = { __v: v, data: filters };
    localStorage.setItem(lsKey(username, scope), JSON.stringify(payload));
  } catch {}
}

function readLocal(username, scope, defaults, v) {
  try {
    const raw = localStorage.getItem(lsKey(username, scope));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return sanitizeIncoming(parsed && parsed.data, defaults, v);
  } catch {
    return defaults;
  }
}

function sanitizeIncoming(input, defaults /* Filters */, _v) {
  if (!input || typeof input !== "object") return defaults;
  return {
    status: safeString(input.status, defaults.status),
    kategorie: safeString(input.kategorie, defaults.kategorie),
    date: safeString(input.date, defaults.date),
    sort: safeSort(input.sort, defaults.sort),
    // hier könntest du weitere Felder sanft mergen (prio, onlyMine, …)
  };
}
function safeString(x, fb) {
  return typeof x === "string" && x.length > 0 ? x : fb;
}
function safeSort(x, fb) {
  return x === "asc" || x === "desc" ? x : fb;
}

export function useServerSavedFilters(username, opts = {}) {
  const scope = opts.scope || "meldungen";        // z.B. "tasks:Technik"
  const version = typeof opts.version === "number" ? opts.version : 1;
  const debounceMs = typeof opts.debounceMs === "number" ? opts.debounceMs : 250;

  const defaults = useMemo(() => makeDefaults(opts.defaults), [opts.defaults]);

  const [filters, setFilters] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const firstSync = useRef(true);
  const saveTimer = useRef(null);

  // Laden (Server -> Fallback localStorage)
  useEffect(() => {
    let aborted = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 1) Server-Prefs laden
        const prefs = await fetchJSON(
          `/api/users/${encodeURIComponent(username)}/prefs`
        );
        const raw = prefs ? prefs[scope] : null;
        const merged = sanitizeIncoming(raw, defaults, version);
        if (!aborted) {
          setFilters(merged);
          cacheLocal(username, scope, merged, version);
        }
      } catch {
        // 2) Fallback localStorage
        const local = readLocal(username, scope, defaults, version);
        if (!aborted) setFilters(local);
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    load();
    return () => {
      aborted = true;
    };
  }, [username, scope, version, defaults]);

  // Debounced Speichern bei Filter-Änderung
  useEffect(() => {
    if (loading) return;      // nicht während initialem Laden speichern
    if (firstSync.current) {  // erste Setter nach dem Laden überspringen
      firstSync.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      try {
        cacheLocal(username, scope, filters, version);
        await fetchJSON(
          `/api/users/${encodeURIComponent(username)}/prefs`,
          {
            method: "PATCH",
            body: JSON.stringify({ [scope]: filters }),
          }
        );
        setError(null);
        setLastSavedAt(new Date().toISOString());
      } catch (e) {
        setError(e && e.message ? e.message : "Speichern fehlgeschlagen");
      }
    }, debounceMs);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [filters, username, scope, version, debounceMs, loading]);

  // Sofort speichern (ohne Debounce) – für "Ansicht speichern" Button
  const saveNow = async () => {
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      cacheLocal(username, scope, filters, version);
      await fetchJSON(
        `/api/users/${encodeURIComponent(username)}/prefs`,
        {
          method: "PATCH",
          body: JSON.stringify({ [scope]: filters }),
        }
      );
      setError(null);
      setLastSavedAt(new Date().toISOString());
      return true;
    } catch (e) {
      setError(e && e.message ? e.message : "Speichern fehlgeschlagen");
      return false;
    }
  };

  const reset = () => setFilters(makeDefaults(opts.defaults));

  return { filters, setFilters, loading, error, reset, saveNow, lastSavedAt };
}
