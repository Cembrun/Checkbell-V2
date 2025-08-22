// src/pages/Dashboard.jsx
import { useEffect, useMemo, useRef, useState } from "react";

/* =========================
   Inline: StatusBadge
   ========================= */
function StatusBadge({ item, compact = false }) {
  const isDone = item.status === "erledigt" || item.completed;
  const ts = item.completedAt || item.erledigtAm || item.updatedAt || item.createdAt;
  const when =
    ts &&
    (function () {
      try {
        return new Date(ts).toLocaleString("de-DE");
      } catch {
        return "";
      }
    })();

  if (compact) {
    return (
      <span
        className={`inline-block text-[11px] px-2 py-0.5 rounded ${
          isDone ? "bg-green-700" : "bg-yellow-700"
        }`}
      >
        {isDone ? "erledigt" : "offen"}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-2 py-1 rounded ${
        isDone ? "bg-green-700" : "bg-yellow-700"
      }`}
    >
      <strong>{isDone ? "Erledigt" : "Offen"}</strong>
      {when && <span className="text-xs opacity-90">{when}</span>}
      {item.erledigtVon && (
        <span className="text-xs opacity-90">von {item.erledigtVon}</span>
      )}
    </div>
  );
}

/* =========================
   Inline: useServerSavedFilters (JS)
   - speichert Prefs auf Server + localStorage
   - bietet saveNow() für "Ansicht speichern"
   ========================= */
function useServerSavedFilters(username, opts = {}) {
  const scope = opts.scope || "meldungen";
  const version = typeof opts.version === "number" ? opts.version : 1;
  const debounceMs =
    typeof opts.debounceMs === "number" ? opts.debounceMs : 250;

  const BASE_DEFAULTS = {
    status: "alle",
    kategorie: "alle",
    date: "all",
    sort: "desc",
  };
  const defaults = useMemo(
    () => ({ ...BASE_DEFAULTS, ...(opts.defaults || {}) }),
    [opts.defaults]
  );

  const [filters, setFilters] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const firstSync = useRef(true);

  const LS_KEY = `checkbell:prefs:${username}:${scope}`;

  const fetchJSON = async (url, init) => {
    const res = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init && init.headers ? init.headers : {}),
      },
      ...(init || {}),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || `HTTP ${res.status}`);
    }
    return res.json();
  };

  const sanitize = (input, defs) => {
    if (!input || typeof input !== "object") return defs;
    const safeSort = (x, fb) => (x === "asc" || x === "desc" ? x : fb);
    const safeStr = (x, fb) => (typeof x === "string" && x ? x : fb);
    return {
      status: safeStr(input.status, defs.status),
      kategorie: safeStr(input.kategorie, defs.kategorie),
      date: safeStr(input.date, defs.date),
      sort: safeSort(input.sort, defs.sort),
    };
  };

  const readLocal = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return sanitize(parsed?.data, defaults);
    } catch {
      return defaults;
    }
  };
  const writeLocal = (f) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ __v: version, data: f }));
    } catch {}
  };

  // Load on mount / username/scope change
  useEffect(() => {
    let abort = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const prefs = await fetchJSON(
          `http://localhost:4000/api/users/${encodeURIComponent(
            username
          )}/prefs`
        );
        const loaded = sanitize(prefs?.[scope], defaults);
        if (!abort) {
          setFilters(loaded);
          writeLocal(loaded);
        }
      } catch {
        const local = readLocal();
        if (!abort) setFilters(local);
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => {
      abort = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, scope, version]);

  // Debounced auto-save to server
  useEffect(() => {
    if (loading) return;
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    const t = setTimeout(async () => {
      try {
        writeLocal(filters);
        await fetchJSON(
          `http://localhost:4000/api/users/${encodeURIComponent(
            username
          )}/prefs`,
          { method: "PATCH", body: JSON.stringify({ [scope]: filters }) }
        );
        setLastSavedAt(Date.now());
      } catch (e) {
        setError(e?.message || "Speichern fehlgeschlagen");
      }
    }, debounceMs);
    return () => clearTimeout(t);
  }, [filters, loading, username, scope, debounceMs]);

  // Manual save (for "Ansicht speichern" button)
  const saveNow = async () => {
    try {
      writeLocal(filters);
      await fetchJSON(
        `http://localhost:4000/api/users/${encodeURIComponent(
          username
        )}/prefs`,
        { method: "PATCH", body: JSON.stringify({ [scope]: filters }) }
      );
      setLastSavedAt(Date.now());
      return true;
    } catch (e) {
      setError(e?.message || "Speichern fehlgeschlagen");
      return false;
    }
  };

  const reset = () => setFilters(defaults);

  return { filters, setFilters, loading, error, reset, saveNow, lastSavedAt };
}

/* =========================
   Dashboard (selbst-enthaltend)
   ========================= */
const DEPARTMENTS = ["Leitstand", "Technik", "Qualität", "Logistik"];
const TABS = ["tasks", "meldungen", "wiederkehrend"];
const KATS = ["Betrieb", "Technik", "IT"];
const API = "http://localhost:4000";

// Helpers
const isImageExt = (url) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url || "");
const absUploadUrl = (u) => {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `${API}${u.startsWith("/") ? u : "/" + u}`;
};
const fmtOnceDate = (yyyyMMdd) => {
  if (!yyyyMMdd || typeof yyyyMMdd !== "string" || !yyyyMMdd.includes("-"))
    return "Datum fehlt";
  const [y, m, d] = yyyyMMdd.split("-");
  return `${d}.${m}.${y}`;
};
const fmtDateTime = (iso) => {
  if (!iso) return "Zeitpunkt unbekannt";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Zeitpunkt unbekannt";
  }
};

export default function Dashboard({ user, onLogout }) {
  const [activeDepartment, setActiveDepartment] = useState(DEPARTMENTS[0]);
  const [activeTab, setActiveTab] = useState("tasks");

  const [data, setData] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [formVisible, setFormVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [formData, setFormData] = useState({
    kategorie: "",
    titel: "",
    beschreibung: "",
    priorität: "",
    zielAbteilung: "",
  });
  const [file, setFile] = useState(null);
  const dropRef = useRef();

  const [weiterleitenIndex, setWeiterleitenIndex] = useState(null);
  const [weiterleitenZiel, setWeiterleitenZiel] = useState("");
  const [notizText, setNotizText] = useState("");
  const [activeNotizIndex, setActiveNotizIndex] = useState(null);

  // Wiederkehrend – Vorlagen
  const [recList, setRecList] = useState([]);
  const [recForm, setRecForm] = useState({
    id: null,
    titel: "",
    beschreibung: "",
    zeit: "07:00",
    intervall: "daily",
    dueDate: "",
    anleitungUrl: "",
    vorlaufMin: 120,
    cooldownHours: 8,
  });
  const [recUploadFile, setRecUploadFile] = useState(null);

  // Preview
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setPreview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Gespeicherte Filter (Scope = Tab/Abteilung, „wiederkehrend“ nutzt „tasks“-Scope)
  const effectiveTabForScope =
    activeTab === "wiederkehrend" ? "tasks" : activeTab;
  const scope = useMemo(
    () => `${effectiveTabForScope}:${activeDepartment}`,
    [effectiveTabForScope, activeDepartment]
  );
  const {
    filters: savedFilters,
    setFilters: setSavedFilters,
    loading: prefsLoading,
    error: prefsError,
    reset: resetFilters,
    saveNow,
  } = useServerSavedFilters(user.username, {
    scope,
    version: 1,
    defaults: { status: "alle", kategorie: "alle", date: "all", sort: "desc" },
  });

  // „Gespeichert!“ Toast
  const [justSaved, setJustSaved] = useState(false);
  const handleSaveView = async () => {
    const ok = await saveNow();
    if (ok) {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    }
  };

  // Fetch-Trigger stabil halten
  const fetchKey = useMemo(
    () =>
      JSON.stringify({
        dep: activeDepartment,
        tab: activeTab,
        status: savedFilters.status,
        date: savedFilters.date,
        sort: savedFilters.sort,
        kat: savedFilters.kategorie,
      }),
    [
      activeDepartment,
      activeTab,
      savedFilters.status,
      savedFilters.date,
      savedFilters.sort,
      savedFilters.kategorie,
    ]
  );

  // Sequenz zum Abbrechen/Überschreiben
  const fetchSeq = useRef(0);

  useEffect(() => {
    if (prefsLoading) return; // erst laden, wenn Prefs da sind

    let cancelled = false;
    const seq = ++fetchSeq.current;

    const loadRecurring = async () => {
      setListLoading(true);
      setListError("");
      try {
        const r = await fetch(
          `${API}/api/${activeDepartment}/recurring`,
          { credentials: "include" }
        );
        const js = await r.json();
        if (!cancelled && seq === fetchSeq.current)
          setRecList(Array.isArray(js) ? js : []);
      } catch {
        if (!cancelled && seq === fetchSeq.current) setRecList([]);
      } finally {
        if (!cancelled && seq === fetchSeq.current) setListLoading(false);
      }
    };

    const loadList = async () => {
      setListLoading(true);
      setListError("");
      try {
        const sp = new URLSearchParams();
        const isLeitstandMeldungen =
          activeDepartment === "Leitstand" && activeTab === "meldungen";

        if (!isLeitstandMeldungen && savedFilters.status !== "alle") {
          sp.set("status", savedFilters.status);
        }
        if (savedFilters.date !== "all") sp.set("day", savedFilters.date);
        if (savedFilters.sort === "asc") sp.set("sort", "asc");

        const url = `${API}/api/${activeDepartment}/${activeTab}${
          sp.toString() ? "?" + sp.toString() : ""
        }`;

        const res = await fetch(url, { credentials: "include" });
        const json = await res.json();

        const filtered =
          savedFilters.kategorie === "alle"
            ? json
            : (json || []).filter(
                (x) =>
                  String(x.kategorie || "").toLowerCase() ===
                  savedFilters.kategorie.toLowerCase()
              );

        if (!cancelled && seq === fetchSeq.current) setData(filtered || []);
      } catch (err) {
        if (!cancelled && seq === fetchSeq.current) {
          setListError(err?.message || "Laden fehlgeschlagen");
          setData([]);
        }
      } finally {
        if (!cancelled && seq === fetchSeq.current) setListLoading(false);
      }
    };

    if (activeTab === "wiederkehrend") loadRecurring();
    else loadList();

    return () => {
      cancelled = true;
    };
  }, [fetchKey, prefsLoading, activeDepartment, activeTab]);

  // Drag&Drop
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.add("border-blue-400");
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.remove("border-blue-400");
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.remove("border-blue-400");
    if (e.dataTransfer.files?.length) {
      setFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  // CRUD (create/complete/delete/forward/note)
  const handleSubmit = async (e) => {
    e.preventDefault();
    const zielDep =
      activeTab === "meldungen" && formData.zielAbteilung
        ? formData.zielAbteilung
        : activeDepartment;

    const eintrag = {
      ...formData,
      erstelltVon: user.username,
      erstelltAm: new Date().toLocaleString("de-DE"),
      status: "offen",
    };

    const fd = new FormData();
    fd.append("eintrag", JSON.stringify(eintrag));
    if (file) fd.append("anhangDatei", file);

    try {
      const res = await fetch(`${API}/api/${zielDep}/${activeTab}`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
    } catch (err) {
      alert(err.message);
      return;
    }

    setFormVisible(false);
    setFormData({
      kategorie: "",
      titel: "",
      beschreibung: "",
      priorität: "",
      zielAbteilung: "",
    });
    setFile(null);
    setEditingIndex(null);

    // manuell reload triggern
    setTimeout(() => {
      fetchSeq.current++;
    }, 0);
  };

  const handleDelete = async (index) => {
    const item = data[index];
    const tryDelete = (idOrIndex) =>
      fetch(`${API}/api/${activeDepartment}/${activeTab}/${idOrIndex}`, {
        method: "DELETE",
        credentials: "include",
      });

    try {
      let res;
      if (item?.id) {
        res = await tryDelete(item.id);
        if (res.status === 404) res = await tryDelete(index);
      } else {
        res = await tryDelete(index);
      }
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
      setData((prev) => prev.filter((_, i) => i !== index));
    } catch (error) {
      alert(error.message || "Löschen fehlgeschlagen");
    }
  };

  const toggleCompleted = async (index) => {
    const item = data[index];
    if (!item?.id) return alert("Kein Task-ID gefunden");
    const desiredCompleted = !Boolean(item.completed);

    const optimistic = {
      ...item,
      completed: desiredCompleted,
      status: desiredCompleted ? "erledigt" : "offen",
      erledigtVon: desiredCompleted
        ? user.username || "unbekannt"
        : item.erledigtVon,
      completedAt: desiredCompleted ? new Date().toISOString() : null,
    };

    setData((prev) => {
      const copy = [...prev];
      const filter = savedFilters.status;
      const hides =
        filter !== "alle" &&
        ((filter === "offen" && optimistic.status === "erledigt") ||
          (filter === "erledigt" && optimistic.status === "offen"));
      if (hides) copy.splice(index, 1);
      else copy[index] = optimistic;
      return copy;
    });

    try {
      const res = await fetch(
        `${API}/api/${activeDepartment}/${activeTab}/${item.id}/complete`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completed: desiredCompleted,
            erledigtVon: user.username,
          }),
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error("Status-Update fehlgeschlagen");
    } catch (error) {
      alert(error.message || "Fehler beim Status-Update");
      setTimeout(() => {
        fetchSeq.current++;
      }, 0);
    }
  };

  const handleEdit = (index) => {
    setFormData(data[index]);
    setEditingIndex(index);
    setFormVisible(true);
    setFile(null);
  };

  const handleWeiterleiten = async (index) => {
    if (!weiterleitenZiel)
      return alert("Bitte eine Zielabteilung auswählen!");
    const item = data[index];
    if (!item?.id) return alert("Kein Task/Meldungs-ID gefunden");
    try {
      const res = await fetch(
        `${API}/api/${activeDepartment}/${activeTab}/${item.id}/weiterleiten`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zielAbteilung: weiterleitenZiel }),
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error("Weiterleiten fehlgeschlagen");
      alert("Aufgabe erfolgreich weitergeleitet");
      setWeiterleitenIndex(null);
      setWeiterleitenZiel("");
      setTimeout(() => {
        fetchSeq.current++;
      }, 0);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleAddNotiz = async (index) => {
    const item = data[index];
    const idOrIndex = item?.id ?? index;
    if (!notizText.trim()) return alert("Bitte Text für die Notiz eingeben!");

    try {
      const res = await fetch(
        `${API}/api/${activeDepartment}/${activeTab}/${idOrIndex}/notiz`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            autor: user.username,
            text: notizText,
            zeit: new Date().toLocaleString("de-DE"),
          }),
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error("Notiz speichern fehlgeschlagen");
      const updated = await res.json();
      setData((prev) => prev.map((x, i) => (i === index ? updated : x)));
      setNotizText("");
      setActiveNotizIndex(null);
    } catch (error) {
      alert(error.message);
    }
  };

  const disableStatusSelect =
    activeDepartment === "Leitstand" && activeTab === "meldungen";

  /* ----------------- UI ----------------- */
  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 p-4 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-bold text-blue-400">CheckBell</h1>
        <div className="text-sm text-gray-300">
          <span className="font-semibold">{user.username}</span>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="w-52 bg-gray-800 p-4">
          <h2 className="font-bold text-xl mb-6">Abteilungen</h2>
          {DEPARTMENTS.map((dep) => (
            <button
              key={dep}
              onClick={() => setActiveDepartment(dep)}
              className={`block w-full text-left px-3 py-2 mb-2 rounded ${
                activeDepartment === dep ? "bg-blue-600" : "bg-gray-700"
              }`}
            >
              {dep}
            </button>
          ))}
          <button onClick={onLogout} className="mt-8 text-red-400 underline">
            Logout
          </button>
        </aside>

        <main className="flex-1 p-6">
          {/* Tabs + Filter */}
          <div className="flex justify-between items-center mb-4">
            <div className="space-x-2">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded ${
                    activeTab === tab ? "bg-blue-500" : "bg-gray-700"
                  }`}
                >
                  {tab === "tasks"
                    ? "Tasks"
                    : tab === "meldungen"
                    ? "Meldungen"
                    : "Wiederkehrend"}
                </button>
              ))}
            </div>

            {activeTab !== "wiederkehrend" && (
              <div className="space-x-2 flex flex-wrap items-center justify-end">
                {prefsError && (
                  <span className="text-red-400 text-xs">
                    Prefs: {String(prefsError)}
                  </span>
                )}
                {prefsLoading && (
                  <span className="text-xs text-gray-400">
                    Lade gespeicherte Filter…
                  </span>
                )}
                {justSaved && (
                  <span className="text-xs text-green-400">Gespeichert!</span>
                )}

                <select
                  onChange={(e) =>
                    setSavedFilters((f) => ({ ...f, kategorie: e.target.value }))
                  }
                  className="bg-gray-700 px-3 py-1 rounded"
                  value={savedFilters.kategorie}
                  disabled={prefsLoading}
                  title="Kategorie"
                >
                  <option value="alle">Alle Kategorien</option>
                  {KATS.map((kat) => (
                    <option key={kat} value={kat}>
                      {kat}
                    </option>
                  ))}
                </select>

                <select
                  onChange={(e) =>
                    setSavedFilters((f) => ({ ...f, status: e.target.value }))
                  }
                  className={`bg-gray-700 px-3 py-1 rounded ${
                    disableStatusSelect ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  value={disableStatusSelect ? "alle" : savedFilters.status}
                  disabled={prefsLoading || disableStatusSelect}
                  title="Status"
                >
                  <option value="alle">Alle</option>
                  <option value="offen">Offen</option>
                  <option value="erledigt">Erledigt</option>
                </select>

                <select
                  value={savedFilters.date}
                  onChange={(e) =>
                    setSavedFilters((f) => ({ ...f, date: e.target.value }))
                  }
                  className="bg-gray-700 px-3 py-1 rounded"
                  disabled={prefsLoading}
                  title="Zeitraum"
                >
                  <option value="all">Alle Tage</option>
                  <option value="today">Heute</option>
                  <option value="yesterday">Gestern</option>
                  <option value="last7">Letzte 7 Tage</option>
                </select>

                <select
                  value={savedFilters.sort}
                  onChange={(e) =>
                    setSavedFilters((f) => ({
                      ...f,
                      sort: e.target.value === "asc" ? "asc" : "desc",
                    }))
                  }
                  className="bg-gray-700 px-3 py-1 rounded"
                  disabled={prefsLoading}
                  title="Sortierung"
                >
                  <option value="desc">Neu → Alt</option>
                  <option value="asc">Alt → Neu</option>
                </select>

                <button
                  onClick={() => {
                    setFormVisible(true);
                    setFormData({
                      kategorie: "",
                      titel: "",
                      beschreibung: "",
                      priorität: "",
                      zielAbteilung: "",
                    });
                    setEditingIndex(null);
                    setFile(null);
                  }}
                  className="bg-green-600 px-4 py-2 rounded"
                >
                  ➕ Hinzufügen
                </button>

                <button
                  onClick={handleSaveView}
                  className="bg-blue-700 px-3 py-1 rounded"
                  disabled={prefsLoading}
                  title="Aktuelle Ansicht (Filter) dauerhaft speichern"
                >
                  Ansicht speichern
                </button>

                <button
                  onClick={resetFilters}
                  className="bg-gray-600 px-3 py-1 rounded"
                  disabled={prefsLoading}
                  title="Filter zurücksetzen"
                >
                  Reset
                </button>

                <button
                  onClick={() => {
                    fetchSeq.current++;
                  }}
                  className="bg-gray-700 px-3 py-1 rounded"
                  title="Liste manuell aktualisieren"
                >
                  Aktualisieren
                </button>
              </div>
            )}
          </div>

          {/* Formular (Tasks/Meldungen) */}
          {activeTab !== "wiederkehrend" && formVisible && (
            <form
              onSubmit={handleSubmit}
              className="bg-gray-800 p-4 rounded space-y-4 mb-6"
              encType="multipart/form-data"
            >
              <select
                className="w-full p-2 bg-gray-700 rounded"
                value={formData.kategorie}
                onChange={(e) =>
                  setFormData({ ...formData, kategorie: e.target.value })
                }
              >
                <option value="">Kategorie wählen</option>
                {KATS.map((kat) => (
                  <option key={kat} value={kat}>
                    {kat}
                  </option>
                ))}
              </select>
              <input
                className="w-full p-2 bg-gray-700 rounded"
                placeholder="Titel"
                value={formData.titel}
                onChange={(e) =>
                  setFormData({ ...formData, titel: e.target.value })
                }
              />
              <textarea
                className="w-full p-2 bg-gray-700 rounded"
                placeholder="Beschreibung"
                value={formData.beschreibung}
                onChange={(e) =>
                  setFormData({ ...formData, beschreibung: e.target.value })
                }
              />
              <select
                className="w-full p-2 bg-gray-700 rounded"
                value={formData.priorität}
                onChange={(e) =>
                  setFormData({ ...formData, priorität: e.target.value })
                }
              >
                <option value="">Priorität wählen</option>
                <option value="hoch">Hoch</option>
                <option value="mittel">Mittel</option>
                <option value="niedrig">Niedrig</option>
              </select>

              {activeTab === "meldungen" && (
                <select
                  className="w-full p-2 bg-gray-700 rounded"
                  value={formData.zielAbteilung}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      zielAbteilung: e.target.value,
                    })
                  }
                >
                  <option value="">Keine Weiterleitung</option>
                  {DEPARTMENTS.filter((dep) => dep !== activeDepartment).map(
                    (dep) => (
                      <option key={dep} value={dep}>
                        {dep}
                      </option>
                    )
                  )}
                </select>
              )}

              <div
                ref={dropRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`w-full p-6 bg-gray-700 border-2 border-dashed rounded text-center text-gray-400 cursor-pointer ${
                  file ? "border-green-500" : "border-gray-600"
                }`}
              >
                {file ? (
                  <div>
                    📎 Datei ausgewählt: <strong>{file.name}</strong>{" "}
                    <button
                      type="button"
                      className="ml-2 text-red-500 underline"
                      onClick={() => setFile(null)}
                    >
                      Entfernen
                    </button>
                  </div>
                ) : (
                  <>Datei hierher ziehen (Drag & Drop)</>
                )}
              </div>

              <div className="flex space-x-2">
                <button type="submit" className="bg-blue-600 px-4 py-2 rounded">
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={() => setFormVisible(false)}
                  className="bg-gray-600 px-4 py-2 rounded"
                >
                  Schließen
                </button>
              </div>
            </form>
          )}

          {/* Liste (Tasks/Meldungen) */}
          {activeTab !== "wiederkehrend" && (
            <div className="space-y-3">
              {listError && (
                <div className="text-red-400 text-sm">{listError}</div>
              )}
              {listLoading && (
                <div className="text-sm text-gray-400">Lade …</div>
              )}
              {!listLoading && data.length === 0 && (
                <div className="text-sm text-gray-400">Keine Einträge.</div>
              )}

              {data.map((item, index) => {
                const fileUrl = absUploadUrl(item.anhangDateiUrl);
                const canPreview = isImageExt(item.anhangDateiUrl);
                return (
                  <div
                    key={item.id ?? index}
                    className="bg-gray-800 p-3 rounded flex justify-between items-center cursor-pointer"
                    onDoubleClick={() =>
                      setData((old) =>
                        old.map((d, i) =>
                          i === index ? { ...d, expanded: !d.expanded } : d
                        )
                      )
                    }
                  >
                    <div className="flex-1 pr-4">
                      <div className="font-bold flex items-center gap-2">
                        {item.titel}

                        {item.anhangDateiUrl && (
                          <>
                            <button
                              className="text-blue-400 underline"
                              title={
                                canPreview ? "Anhang anzeigen" : "Datei öffnen"
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                if (canPreview) {
                                  setPreview({
                                    url: fileUrl,
                                    isImage: true,
                                    name:
                                      (item.titel || "Anhang") +
                                      " – " +
                                      (item.anhangDateiUrl.split("/").pop() ||
                                        ""),
                                  });
                                } else {
                                  window.open(fileUrl, "_blank");
                                }
                              }}
                            >
                              📎
                            </button>
                            <a
                              className="text-blue-400 underline"
                              href={fileUrl}
                              download
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Herunterladen"
                            >
                              ⬇️
                            </a>
                          </>
                        )}

                        {item.anleitungUrl && (
                          <a
                            href={absUploadUrl(item.anleitungUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400"
                            onClick={(e) => e.stopPropagation()}
                            title="Anleitung öffnen"
                          >
                            📘
                          </a>
                        )}

                        {item.fromRecurring && (
                          <span className="text-xs bg-blue-700 rounded px-2 py-0.5">
                            wiederkehrend
                          </span>
                        )}
                        {item.dueDate && (
                          <span className="text-xs bg-gray-700 rounded px-2 py-0.5">
                            fällig: {item.dueDate}
                          </span>
                        )}
                      </div>

                      {item.expanded ? (
                        <>
                          <div className="text-sm text-gray-300 mt-1">
                            {item.beschreibung}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {item.kategorie} | Priorität: {item.priorität} | Von{" "}
                            {item.erstelltVon || "System"} – {item.erstelltAm}
                            {item.quelleAbteilung &&
                              item.quelleAbteilung !== activeDepartment && (
                                <> | Quelle: {item.quelleAbteilung}</>
                              )}
                            {item.zielAbteilung &&
                              item.zielAbteilung !== activeDepartment && (
                                <> | Ziel: {item.zielAbteilung}</>
                              )}
                          </div>

                          <div className="mt-2">
                            <StatusBadge item={item} />
                          </div>

                          {Array.isArray(item.anhaenge) &&
                            item.anhaenge.length > 0 && (
                              <div className="mt-2 text-xs">
                                <div className="font-semibold mb-1">
                                  📎 Anhänge
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {item.anhaenge.map((f, idx) => {
                                    const url = absUploadUrl(f.url);
                                    const isImg = isImageExt(f.url);
                                    return (
                                      <div
                                        key={idx}
                                        className="bg-gray-700 rounded px-2 py-1 flex items-center gap-2"
                                      >
                                        <button
                                          className="underline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (isImg)
                                              setPreview({
                                                url,
                                                isImage: true,
                                                name:
                                                  f.name || `Anhang ${idx + 1}`,
                                              });
                                            else window.open(url, "_blank");
                                          }}
                                        >
                                          {f.name || `Datei ${idx + 1}`}
                                        </button>
                                        <a
                                          href={url}
                                          download
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          title="Download"
                                        >
                                          ⬇️
                                        </a>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                          {item.notizen?.length > 0 && (
                            <div className="mt-3 text-xs text-gray-200">
                              <div className="font-semibold mb-1">
                                📝 Notizen
                              </div>
                              {item.notizen.map((n, i) => (
                                <div
                                  key={i}
                                  className="mb-1 border-l-2 border-gray-600 pl-2"
                                >
                                  <span className="font-semibold">
                                    {n.autor}
                                  </span>{" "}
                                  ({n.zeit}): {n.text}
                                </div>
                              ))}
                            </div>
                          )}

                          {activeNotizIndex === index ? (
                            <div className="mt-2 flex gap-2">
                              <input
                                type="text"
                                className="flex-1 p-1 rounded bg-gray-700 text-white text-sm"
                                placeholder="Notiz schreiben..."
                                value={notizText}
                                onChange={(e) => setNotizText(e.target.value)}
                              />
                              <button
                                onClick={() => handleAddNotiz(index)}
                                className="bg-blue-600 px-2 py-1 rounded text-sm"
                              >
                                Speichern
                              </button>
                              <button
                                onClick={() => {
                                  setActiveNotizIndex(null);
                                  setNotizText("");
                                }}
                                className="bg-gray-600 px-2 py-1 rounded text-sm"
                              >
                                Abbrechen
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveNotizIndex(index);
                              }}
                              className="mt-2 text-xs text-blue-400 underline"
                            >
                              ➕ Notiz hinzufügen
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-sm text-gray-400">
                            {item.beschreibung?.slice(0, 60)}…
                          </div>
                          <div className="mt-1">
                            <StatusBadge item={item} compact />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex gap-2 items-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCompleted(index);
                        }}
                        className={`px-2 py-1 rounded text-xs ${
                          item.completed ? "bg-gray-600" : "bg-green-600"
                        }`}
                      >
                        {item.completed ? "Rückgängig" : "Erledigt"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(index);
                        }}
                        className="px-2 py-1 rounded text-xs bg-yellow-600"
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(index);
                        }}
                        className="px-2 py-1 rounded text-xs bg-red-600"
                      >
                        Löschen
                      </button>

                      {weiterleitenIndex === index ? (
                        <div className="flex gap-1 items-center">
                          <select
                            value={weiterleitenZiel}
                            onChange={(e) => setWeiterleitenZiel(e.target.value)}
                            className="bg-gray-700 text-xs p-1 rounded"
                          >
                            <option value="">Abteilung wählen</option>
                            {DEPARTMENTS.filter(
                              (dep) => dep !== activeDepartment
                            ).map((dep) => (
                              <option key={dep} value={dep}>
                                {dep}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleWeiterleiten(index);
                            }}
                            className="bg-blue-500 text-xs px-2 py-1 rounded"
                          >
                            OK
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setWeiterleitenIndex(null);
                            }}
                            className="bg-gray-600 text-xs px-2 py-1 rounded"
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setWeiterleitenIndex(index);
                          }}
                          className="px-2 py-1 rounded text-xs bg-blue-600"
                        >
                          Weiterleiten
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab: Wiederkehrend */}
          {activeTab === "wiederkehrend" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Formular */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();

                  if (recForm.intervall === "once" && !recForm.dueDate) {
                    alert("Bitte Datum wählen (bei einmaligen Aufgaben).");
                    return;
                  }

                  let anleitungUrl = recForm.anleitungUrl;
                  try {
                    if (recUploadFile) {
                      const fd = new FormData();
                      fd.append("anleitung", recUploadFile);
                      const r = await fetch(
                        `${API}/api/${activeDepartment}/recurring/upload`,
                        { method: "POST", body: fd, credentials: "include" }
                      );
                      if (!r.ok) throw new Error("Upload fehlgeschlagen");
                      const { url } = await r.json();
                      if (url) anleitungUrl = url;
                    }

                    const body = {
                      ...recForm,
                      anleitungUrl,
                      createdBy: user.username,
                    };

                    let r;
                    if (recForm.id) {
                      r = await fetch(
                        `${API}/api/${activeDepartment}/recurring/${recForm.id}`,
                        {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(body),
                          credentials: "include",
                        }
                      );
                    } else {
                      r = await fetch(
                        `${API}/api/${activeDepartment}/recurring`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(body),
                          credentials: "include",
                        }
                      );
                    }
                    if (!r.ok) throw new Error("Recurring speichern fehlgeschlagen");

                    setRecForm({
                      id: null,
                      titel: "",
                      beschreibung: "",
                      zeit: "07:00",
                      intervall: "daily",
                      dueDate: "",
                      anleitungUrl: "",
                      vorlaufMin: 120,
                      cooldownHours: 8,
                    });
                    setRecUploadFile(null);
                    setTimeout(() => {
                      fetchSeq.current++;
                    }, 0);
                  } catch (err) {
                    alert(err.message);
                  }
                }}
                className="bg-gray-800 p-4 rounded space-y-3"
              >
                <h3 className="font-bold text-lg mb-2">
                  {recForm.id
                    ? "Vorlage bearbeiten"
                    : "Neues wiederkehrendes Task"}{" "}
                  ({activeDepartment})
                </h3>
                <input
                  className="w-full p-2 bg-gray-700 rounded"
                  placeholder="Titel"
                  value={recForm.titel}
                  onChange={(e) =>
                    setRecForm({ ...recForm, titel: e.target.value })
                  }
                  required
                />
                <textarea
                  className="w-full p-2 bg-gray-700 rounded"
                  placeholder="Beschreibung"
                  value={recForm.beschreibung}
                  onChange={(e) =>
                    setRecForm({ ...recForm, beschreibung: e.target.value })
                  }
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400">Uhrzeit</label>
                    <input
                      className="w-full p-2 bg-gray-700 rounded"
                      type="time"
                      value={recForm.zeit}
                      onChange={(e) =>
                        setRecForm({ ...recForm, zeit: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400">Intervall</label>
                    <select
                      className="w-full p-2 bg-gray-700 rounded"
                      value={recForm.intervall}
                      onChange={(e) =>
                        setRecForm({ ...recForm, intervall: e.target.value })
                      }
                    >
                      <option value="daily">täglich</option>
                      <option value="once">einmalig</option>
                    </select>
                  </div>
                  {recForm.intervall === "once" && (
                    <div className="flex-1">
                      <label className="text-xs text-gray-400">
                        Datum (einmalig)
                      </label>
                      <input
                        className="w-full p-2 bg-gray-700 rounded"
                        type="date"
                        value={recForm.dueDate}
                        onChange={(e) =>
                          setRecForm({ ...recForm, dueDate: e.target.value })
                        }
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400">
                      Vorlauf (Minuten)
                    </label>
                    <input
                      className="w-full p-2 bg-gray-700 rounded"
                      type="number"
                      min="0"
                      value={recForm.vorlaufMin}
                      onChange={(e) =>
                        setRecForm({ ...recForm, vorlaufMin: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400">
                      Cooldown (Stunden)
                    </label>
                    <input
                      className="w-full p-2 bg-gray-700 rounded"
                      type="number"
                      min="0"
                      value={recForm.cooldownHours}
                      onChange={(e) =>
                        setRecForm({
                          ...recForm,
                          cooldownHours: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400">
                    Anleitung (URL oder Datei)
                  </label>
                  <input
                    className="w-full p-2 bg-gray-700 rounded mb-2"
                    placeholder="https://... (optional)"
                    value={recForm.anleitungUrl}
                    onChange={(e) =>
                      setRecForm({ ...recForm, anleitungUrl: e.target.value })
                    }
                  />
                  <input
                    type="file"
                    className="w-full text-sm"
                    onChange={(e) =>
                      setRecUploadFile(e.target.files?.[0] ?? null)
                    }
                  />
                </div>

                <div className="flex gap-2">
                  <button type="submit" className="bg-green-600 px-4 py-2 rounded">
                    {recForm.id ? "Änderungen speichern" : "Speichern"}
                  </button>
                  {recForm.id && (
                    <button
                      type="button"
                      className="bg-gray-600 px-4 py-2 rounded"
                      onClick={() =>
                        setRecForm({
                          id: null,
                          titel: "",
                          beschreibung: "",
                          zeit: "07:00",
                          intervall: "daily",
                          dueDate: "",
                          anleitungUrl: "",
                          vorlaufMin: 120,
                          cooldownHours: 8,
                        })
                      }
                    >
                      Abbrechen
                    </button>
                  )}
                </div>
              </form>

              {/* Liste Vorlagen */}
              <div className="bg-gray-800 p-4 rounded">
                <h3 className="font-bold text-lg mb-2">
                  Wiederkehrende Tasks – Vorlagen
                </h3>
                {recList.length === 0 && (
                  <div className="text-sm text-gray-400">
                    Keine Vorlagen vorhanden.
                  </div>
                )}
                <div className="space-y-2">
                  {recList.map((t) => (
                    <div
                      key={t.id}
                      className="bg-gray-700 rounded p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold">{t.titel}</div>
                        <div className="text-xs text-gray-300">
                          {t.intervall === "daily"
                            ? "täglich"
                            : `einmalig am ${fmtOnceDate(t.dueDate)}`}{" "}
                          – um {t.zeit}
                          {t.anleitungUrl && (
                            <>
                              {" "}
                              |{" "}
                              <a
                                href={absUploadUrl(t.anleitungUrl)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 underline"
                              >
                                Anleitung
                              </a>
                            </>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">
                          angelegt von {t.createdBy || "unbekannt"} ·{" "}
                          {fmtDateTime(t.createdAt)} | Vorlauf:{" "}
                          {t.vorlaufMin ?? 0} min · Cooldown:{" "}
                          {t.cooldownHours ?? 0} h
                        </div>
                        {t.beschreibung && (
                          <div className="text-xs text-gray-400 mt-1">
                            {t.beschreibung}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            setRecForm({
                              id: t.id,
                              titel: t.titel || "",
                              beschreibung: t.beschreibung || "",
                              zeit: t.zeit || "07:00",
                              intervall: t.intervall || "daily",
                              dueDate: t.dueDate || "",
                              anleitungUrl: t.anleitungUrl || "",
                              vorlaufMin: t.vorlaufMin ?? 0,
                              cooldownHours: t.cooldownHours ?? 0,
                            })
                          }
                          className="bg-yellow-600 text-xs px-2 py-1 rounded"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm("Recurring-Task löschen?")) return;
                            try {
                              const r = await fetch(
                                `${API}/api/${activeDepartment}/recurring/${t.id}`,
                                { method: "DELETE", credentials: "include" }
                              );
                              if (!r.ok) throw new Error("Löschen fehlgeschlagen");
                              setTimeout(() => {
                                fetchSeq.current++;
                              }, 0);
                            } catch (err) {
                              alert(err.message);
                            }
                          }}
                          className="bg-red-600 text-xs px-2 py-1 rounded"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-3">
                  Hinweis: Die heutigen Instanzen werden automatisch erzeugt
                  (unter Berücksichtigung von Vorlauf & Cooldown).
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Preview-Modal */}
      {preview && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-gray-900 p-3 rounded max-w-[92vw] max-h-[88vh] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-300">
                {preview.name || "Anhang"}
              </div>
              <button
                className="px-2 py-1 bg-gray-700 rounded"
                onClick={() => setPreview(null)}
                title="Schließen"
              >
                ✕
              </button>
            </div>
            {preview.isImage ? (
              <img
                src={preview.url}
                alt="Anhang"
                className="max-h-[80vh] max-w-[88vw] object-contain rounded"
              />
            ) : (
              <div className="text-sm text-gray-300">
                Diese Datei kann nicht als Bild angezeigt werden.
              </div>
            )}
            <div className="mt-3 flex gap-2 justify-end">
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 bg-blue-600 rounded"
                onClick={(e) => e.stopPropagation()}
              >
                Öffnen
              </a>
              <button
                className="px-3 py-1 bg-green-600 rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  const a = document.createElement("a");
                  a.href = preview.url;
                  a.setAttribute("download", "");
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                }}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
