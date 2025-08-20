// src/pages/Dashboard.jsx

import { useState, useEffect, useRef, useMemo } from "react";
import StatusBadge from "../components/StatusBadge";
import { exportSinglePDFWithImages } from "../utils/pdfExport";

const departments = ["Leitstand", "Technik", "Qualität", "Logistik"];
const tabs = ["tasks", "meldungen", "Wiederkehrend"];
const kategorien = [
  "Anlage",
  "IT",
  "Haustechnik",
  "Elektrisch",
  "OT",
  "Betrieb"
];

const API = "https://bell-5s68.onrender.com";

// ----------------- Helper -----------------
const isImageExt = (url) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url || "");
const absUploadUrl = (u) => {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `${API}${u.startsWith("/") ? u : "/" + u}`;
};

const fmtOnceDate = (yyyyMMdd) => {
  if (!yyyyMMdd || typeof yyyyMMdd !== "string" || !yyyyMMdd.includes("-")) return "Datum fehlt";
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

// ============ Component ============
export default function Dashboard({ user, onLogout }) {

  // PDF-Export für einzelne Meldung (mit Bildern)
  async function exportSinglePDF(item) {
    await exportSinglePDFWithImages(item);
  }
  const [activeDepartment, setActiveDepartment] = useState(departments[0]);
  const [activeTab, setActiveTab] = useState("tasks");
  const [errorMsg, setErrorMsg] = useState("");
  // Hilfsfunktion zum Laden gespeicherter Filter
  async function loadSavedFilters() {
    try {
      setErrorMsg("");
      const res = await fetch(`http://localhost:4000/api/users/${encodeURIComponent(user.username)}/prefs`, {
        credentials: "include"
      });
      if (!res.ok) {
        if (res.status === 403) setErrorMsg("Keine Berechtigung. Bitte neu einloggen.");
        else if (res.status === 404) setErrorMsg("Benutzer nicht gefunden.");
        else setErrorMsg("Fehler beim Laden der Filter: " + res.status);
        return;
      }
      const prefs = await res.json();
      const key = `${activeTab}:${activeDepartment}`;
      if (prefs && prefs[key]) {
        setFilter((prev) => ({ ...prev, ...prefs[key] }));
      }
    } catch (e) {
      setErrorMsg("Server nicht erreichbar oder Netzwerkfehler.");
    }
  }

  // Lade gespeicherte Filter beim ersten Mount oder wenn Abteilung/Tab wechselt
  useEffect(() => {
    loadSavedFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDepartment, activeTab]);
  // Filter-Ansicht lokal
  const [filter, setFilter] = useState({
    status: "alle",
    kategorie: "alle",
    date: "all",
    sort: "desc",
  });
  const [saveMsg, setSaveMsg] = useState("");
  const [data, setData] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);

  const [formData, setFormData] = useState({
    kategorie: "",
    titel: "",
    beschreibung: "",
    priorität: "",
    zielAbteilung: "",
  });
  const [files, setFiles] = useState([]);
  const dropRef = useRef();

  const [weiterleitenIndex, setWeiterleitenIndex] = useState(null);
  const [weiterleitenZiel, setWeiterleitenZiel] = useState("");

  const [notizText, setNotizText] = useState("");
  const [activeNotizIndex, setActiveNotizIndex] = useState(null);

  // Wiederkehrend – Vorlagen
  const [recList, setRecList] = useState([]);
  const [recForm, setRecForm] = useState({
    id: null,               // wenn gesetzt => PUT
    titel: "",
    beschreibung: "",
    zeit: "07:00",
    intervall: "daily",     // "daily" | "once"
    dueDate: "",            // YYYY-MM-DD (bei once)
    anleitungUrl: "",
    vorlaufMin: 120,        // Minuten früher sichtbar
    cooldownHours: 8,       // Stunden nach Erledigung bis nächste Instanz
  });
  const [recUploadFile, setRecUploadFile] = useState(null);

  // Preview-Modal für Anhänge
  const [preview, setPreview] = useState(null); // { url, isImage, name }
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setPreview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- Server-gespeicherte Filter (pro Tab & Abteilung) ----------
  // Für "wiederkehrend" verwenden wir die gleichen Filter wie "tasks"
  const effectiveTabForScope = activeTab === "wiederkehrend" ? "tasks" : activeTab;
  const scope = useMemo(
    () => `${effectiveTabForScope}:${activeDepartment}`,
    [effectiveTabForScope, activeDepartment]
  );

  const activeFilter = filter;
  const updateFilter = (key, value) => setFilter((prev) => ({ ...prev, [key]: value }));
  const resetFilters = () => setFilter({ status: "alle", kategorie: "alle", date: "all", sort: "desc" });
  // Ansicht speichern
  const saveFilters = async () => {
    try {
      await fetch(`http://localhost:4000/api/users/${encodeURIComponent(user.username)}/prefs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [`${activeTab}:${activeDepartment}`]: filter }),
        credentials: "include",
      });
      setSaveMsg("Ansicht gespeichert!");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e) {
      setSaveMsg("Fehler beim Speichern");
      setTimeout(() => setSaveMsg(""), 2000);
    }
  };

  // ---------- Anti-Zittern: Debounce + Sperre während Interaktion ----------
  const [suspendReload, setSuspendReload] = useState(false);
  const fetchTimer = useRef(null);
  const scheduleFetch = () => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
  if (suspendReload) return;
    fetchTimer.current = setTimeout(() => {
      fetchData();
    }, 200);
  };

  // --------- Laden Tasks/Meldungen ---------
  const fetchData = async () => {
    if (!activeDepartment) return;
    if (activeTab === "wiederkehrend") {
      fetchRecurring();
      return;
    }
    try {
      const params = new URLSearchParams();
      const isLeitstandMeldungen =
        activeDepartment === "Leitstand" && activeTab === "meldungen";

      if (!isLeitstandMeldungen && activeFilter.status !== "alle") {
        params.set("status", activeFilter.status);
      }
      if (activeFilter.date !== "all") params.set("day", activeFilter.date);
      if (activeFilter.sort === "asc") params.set("sort", "asc");

      const url = `${API}/api/${activeDepartment}/${activeTab}${
        params.toString() ? "?" + params.toString() : ""
      }`;

      const res = await fetch(url);
      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("Ladefehler:", err);
      setData([]);
    }
  };

  // --------- Laden Wiederkehrend ---------
  const fetchRecurring = async () => {
    try {
      const r = await fetch(`${API}/api/${activeDepartment}/recurring`);
      setRecList(await r.json());
    } catch {
      setRecList([]);
    }
  };

  // Nur laden, wenn Filter fertig sind & kein Interaktionsmodus
  useEffect(() => {
    scheduleFetch();
    return () => {
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeDepartment,
    activeTab,
    activeFilter.date,
    activeFilter.sort,
    activeFilter.status,
  // prefsLoading entfernt
    suspendReload,
  ]);

  // --------- Drag & Drop ---------
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
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
      e.dataTransfer.clearData();
    }
  };

  // --------- Anlegen Task/Meldung ---------
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

    const formPayload = new FormData();
    formPayload.append("eintrag", JSON.stringify(eintrag));
    files.forEach((f) => {
      formPayload.append("anhangDateien", f);
    });

    try {
      const res = await fetch(`${API}/api/${zielDep}/${activeTab}`, {
        method: "POST",
        body: formPayload,
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
    } catch (error) {
      alert(error.message);
      return;
    }

    setFormVisible(false);
    setSuspendReload(false);
    setFormData({
      kategorie: "",
      titel: "",
      beschreibung: "",
      priorität: "",
      zielAbteilung: "",
    });
    setFiles([]);
    setEditingIndex(null);
    scheduleFetch(); // sanft nachladen
  };

  // --------- Löschen Task/Meldung ---------
  const handleDelete = async (index) => {
    const item = data[index];
    const tryDelete = (idOrIndex) =>
      fetch(`${API}/api/${activeDepartment}/${activeTab}/${idOrIndex}`, {
        method: "DELETE",
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

  // --------- Erledigt/Unerledigt ---------
  const toggleCompleted = async (index) => {
    const item = data[index];
    if (!item?.id) return alert("Kein Task-ID gefunden");

    const desiredCompleted = !Boolean(item.completed);

    // 🔹 Optimistische UI
    const optimistic = {
      ...item,
      completed: desiredCompleted,
      status: desiredCompleted ? "erledigt" : "offen",
      erledigtVon: desiredCompleted ? (user.username || "unbekannt") : item.erledigtVon,
      completedAt: desiredCompleted ? new Date().toISOString() : null,
    };

    // 🔹 Sofort anzeigen / ggf. direkt ausblenden, wenn Filter nicht mehr passt
    setData((prev) => {
      const copy = [...prev];
      const filter = activeFilter.status; // "alle" | "offen" | "erledigt"
      const hides =
        filter !== "alle" &&
        ((filter === "offen" && optimistic.status === "erledigt") ||
          (filter === "erledigt" && optimistic.status === "offen"));

      if (hides) {
        copy.splice(index, 1);
      } else {
        copy[index] = optimistic;
      }
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
        }
      );
      if (!res.ok) throw new Error("Status-Update fehlgeschlagen");
      // sanft neu laden (kleiner Delay, damit Server fertig schreibt)
      setTimeout(() => !suspendReload && scheduleFetch(), 250);
    } catch (error) {
      alert(error.message || "Fehler beim Status-Update");
      scheduleFetch();
    }
  };

  const handleEdit = (index) => {
    setFormData(data[index]);
    setEditingIndex(index);
    setFormVisible(true);
  setFiles([]);
    setSuspendReload(true); // während des Bearbeitens nicht neu laden
  };

  // --------- Weiterleiten ---------
  const handleWeiterleiten = async (index) => {
    if (!weiterleitenZiel) return alert("Bitte eine Zielabteilung auswählen!");
    const item = data[index];
    if (!item?.id) return alert("Kein Task/Meldungs-ID gefunden");
    try {
      const res = await fetch(
        `${API}/api/${activeDepartment}/${activeTab}/${item.id}/weiterleiten`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zielAbteilung: weiterleitenZiel }),
        }
      );
      if (!res.ok) throw new Error("Weiterleiten fehlgeschlagen");
      alert("Aufgabe erfolgreich weitergeleitet");
      setWeiterleitenIndex(null);
      setWeiterleitenZiel("");
      setSuspendReload(false);
      scheduleFetch();
    } catch (error) {
      alert(error.message);
    }
  };

  // --------- Notiz ---------
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
        }
      );
      if (!res.ok) throw new Error("Notiz speichern fehlgeschlagen");
      const updated = await res.json();
      setData((prev) => prev.map((x, i) => (i === index ? updated : x)));
      setNotizText("");
      setActiveNotizIndex(null);
      setSuspendReload(false);
    } catch (error) {
      alert(error.message);
    }
  };

  // --------- Clientseitige Kategorie-Filterung ---------
  const filteredData = data.filter(
    (item) => activeFilter.kategorie === "alle" || item.kategorie === activeFilter.kategorie
  );

  const disableStatusSelect =
    activeDepartment === "Leitstand" && activeTab === "meldungen";

  // --------- Wiederkehrend: Upload + Speichern/Löschen/Edithilfe ---------
  const uploadAnleitung = async () => {
    if (!recUploadFile) return null;
    const fd = new FormData();
    fd.append("anleitung", recUploadFile);
    const r = await fetch(`${API}/api/${activeDepartment}/recurring/upload`, {
      method: "POST",
      body: fd,
    });
    if (!r.ok) throw new Error("Upload fehlgeschlagen");
    const { url } = await r.json();
    return url;
  };

  const saveRecurring = async (e) => {
    e.preventDefault();

    if (recForm.intervall === "once" && !recForm.dueDate) {
      alert("Bitte Datum wählen (bei einmaligen Aufgaben).");
      return;
    }

    let anleitungUrl = recForm.anleitungUrl;

    try {
      if (recUploadFile) {
        const url = await uploadAnleitung();
        if (url) anleitungUrl = url;
      }

      const body = {
        ...recForm,
        anleitungUrl,
        createdBy: user.username,
      };

      let r;
      if (recForm.id) {
        // Update
        r = await fetch(`${API}/api/${activeDepartment}/recurring/${recForm.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        // Create
        r = await fetch(`${API}/api/${activeDepartment}/recurring`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
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
      fetchRecurring();
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteRecurring = async (id) => {
    if (!confirm("Recurring-Task löschen?")) return;
    try {
      const r = await fetch(`${API}/api/${activeDepartment}/recurring/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Löschen fehlgeschlagen");
      fetchRecurring();
    } catch (err) {
      alert(err.message);
    }
  };

  const editRecurring = (t) => {
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
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ----------------- UI -----------------
  return (
  <div className={`flex flex-col min-h-screen ${document.body.classList.contains('light') ? 'bg-gray-200 text-gray-900' : 'bg-gray-900 text-white'}`}> 
      {errorMsg && (
        <div className="bg-red-700 text-white p-3 text-center font-bold">
          {errorMsg}
        </div>
      )}
  <header className={`p-4 flex justify-between items-center shadow-md ${document.body.classList.contains('light') ? 'bg-white border-b border-gray-300' : 'bg-gray-800'}`}> 
        <h1 className="text-xl font-bold text-blue-400">CheckBell</h1>
        <div className="text-sm text-gray-300">
          <span className="font-semibold">{user.username}</span>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className={`w-52 p-4 ${document.body.classList.contains('light') ? 'bg-white border-r border-gray-300' : 'bg-gray-800'}`}> 
          <h2 className="font-bold text-xl mb-6">Abteilungen</h2>
          {departments.map((dep) => (
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
          {/* Tabs */}
          <div className="flex justify-between items-center mb-4">
            <div className="space-x-2">
              {tabs.map((tab) => (
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

            {/* Filter (nicht für Wiederkehrend) */}
            {activeTab !== "wiederkehrend" && (
              <div className="flex flex-wrap justify-end items-center gap-2">
                <button
                  onClick={() => {
                    setFormVisible(true);
                    setSuspendReload(true);
                    setFormData({
                      kategorie: "",
                      titel: "",
                      beschreibung: "",
                      priorität: "",
                      zielAbteilung: "",
                    });
                    setEditingIndex(null);
                  setFiles([]);
                  }}
                  className="bg-green-600 px-2 py-1 rounded text-sm"
                  style={{ minWidth: 32 }}
                  title="Neuen Eintrag hinzufügen"
                >
                  ➕
                </button>

                <select
                  onChange={(e) => updateFilter("kategorie", e.target.value)}
                  className="bg-gray-700 px-3 py-1 rounded"
                  value={activeFilter.kategorie}
                  title="Kategorie"
                >
                  <option value="alle">Alle Kategorien</option>
                  {kategorien.map((kat) => (
                    <option key={kat} value={kat}>
                      {kat}
                    </option>
                  ))}
                </select>

                <select
                  onChange={(e) => updateFilter("status", e.target.value)}
                  className={`bg-gray-700 px-3 py-1 rounded ${
                    activeDepartment === "Leitstand" && activeTab === "meldungen"
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                  value={
                    activeDepartment === "Leitstand" && activeTab === "meldungen"
                      ? "alle"
                      : activeFilter.status
                  }
                  title="Status"
                  disabled={activeDepartment === "Leitstand" && activeTab === "meldungen"}
                >
                  <option value="alle">Alle</option>
                  <option value="offen">Offen</option>
                  <option value="erledigt">Erledigt</option>
                </select>

                <select
                  value={activeFilter.date}
                  onChange={(e) => updateFilter("date", e.target.value)}
                  className="bg-gray-700 px-3 py-1 rounded"
                  title="Zeitraum"
                >
                  <option value="all">Alle Tage</option>
                  <option value="today">Heute</option>
                  <option value="yesterday">Gestern</option>
                  <option value="last7">Letzte 7 Tage</option>
                </select>

                <select
                  value={activeFilter.sort}
                  onChange={(e) => updateFilter("sort", e.target.value)}
                  className="bg-gray-700 px-3 py-1 rounded"
                  title="Sortierung"
                >
                  <option value="desc">Neu → Alt</option>
                  <option value="asc">Alt → Neu</option>
                </select>

                <button
                  onClick={resetFilters}
                  className="bg-gray-600 px-3 py-1 rounded"
                  title="Filter zurücksetzen"
                >
                  Reset
                </button>
                <button
                  onClick={saveFilters}
                  className="bg-blue-600 px-2 py-1 rounded text-xs"
                  style={{ minWidth: 24 }}
                  title="Ansicht speichern"
                >
                  💾
                </button>
                {saveMsg && (
                  <span className="text-green-400 text-xs">{saveMsg}</span>
                )}
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
                {kategorien.map((kat) => (
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
                  {departments
                    .filter((dep) => dep !== activeDepartment)
                    .map((dep) => (
                      <option key={dep} value={dep}>
                        {dep}
                      </option>
                    ))}
                </select>
              )}

              <div
                ref={dropRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`w-full p-6 bg-gray-700 border-2 border-dashed rounded text-center text-gray-400 cursor-pointer ${
                  files.length > 0 ? "border-green-500" : "border-gray-600"
                }`}
              >
                <input
                  type="file"
                  multiple
                  className="hidden"
                  id="fileInput"
                  onChange={e => {
                    if (e.target.files?.length) {
                      setFiles((prev) => [...prev, ...Array.from(e.target.files)]);
                    }
                  }}
                />
                {files.length > 0 ? (
                  <div className="space-y-1">
                    {files.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span>📎 <strong>{f.name}</strong></span>
                        <button
                          type="button"
                          className="ml-2 text-red-500 underline"
                          onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                        >
                          Entfernen
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <label htmlFor="fileInput" className="cursor-pointer">Dateien auswählen oder hierher ziehen (Drag & Drop)</label>
                  </>
                )}
              </div>

              <div className="flex space-x-2">
                <button type="submit" className="bg-blue-600 px-4 py-2 rounded">
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormVisible(false);
                    setSuspendReload(false);
                  }}
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

              {filteredData.map((item, index) => {
                // Anhänge: Kompatibel mit altem Feld (anhangDateiUrl) und neuem Feld (anhangDateien/anhaenge)
                const anhaenge = [];
                if (Array.isArray(item.anhaenge) && item.anhaenge.length > 0) {
                  // Backend liefert [{url, name}]
                  anhaenge.push(...item.anhaenge.map(f => ({ url: f.url, name: f.name })));
                } else if (Array.isArray(item.anhangDateien) && item.anhangDateien.length > 0) {
                  // Backend liefert [string]
                  anhaenge.push(...item.anhangDateien.map(f => ({ url: f, name: f.split('/').pop() })));
                } else if (item.anhangDateiUrl) {
                  anhaenge.push({ url: item.anhangDateiUrl, name: item.anhangDateiUrl.split('/').pop() });
                }
                return (
                  <div
                    key={item.id ?? item.instanceId ?? index}
                    className={`p-3 rounded flex justify-between items-center cursor-pointer shadow-sm transition-colors ${document.body.classList.contains('light') ? 'bg-white border border-gray-200 hover:bg-gray-50' : 'bg-gray-800'}`}
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
                        {anhaenge.length > 0 && anhaenge.map((anh, aidx) => {
                          const fileUrl = absUploadUrl(anh.url);
                          const canPreview = isImageExt(anh.url);
                          return (
                            <span key={aidx} className="flex items-center gap-1">
                              <button
                                className="text-blue-400 underline"
                                title={canPreview ? "Anhang anzeigen" : "Datei öffnen"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canPreview) {
                                    setPreview({
                                      url: fileUrl,
                                      isImage: true,
                                      name: anh.name,
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
                            </span>
                          );
                        })}
                        {/* Anleitung (URL) */}
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
                          {item.notizen?.length > 0 && (
                            <div className="mt-3 text-xs text-gray-200">
                              <div className="font-semibold mb-1">📝 Notizen</div>
                              {item.notizen.map((n, i) => (
                                <div
                                  key={i}
                                  className="mb-1 border-l-2 border-gray-600 pl-2"
                                >
                                  <span className="font-semibold">{n.autor}</span>{" "}
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
                                  setSuspendReload(false);
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
                                setSuspendReload(true);
                              }}
                              className="mt-2 text-xs text-blue-400 underline"
                            >
                              ➕ Notiz hinzufügen
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-sm text-gray-400" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre-line' }}>
                            {item.beschreibung}
                          </div>
                          {/* ✅ kompaktes Badge in Listenansicht */}
                          <div className="mt-1">
                            <StatusBadge item={item} compact />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex gap-2 items-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); exportSinglePDF(item); }}
                        className="px-2 py-1 rounded text-xs bg-blue-600 text-white"
                        title="Diese Meldung als PDF exportieren"
                      >
                        PDF
                      </button>
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
                            {departments
                              .filter((dep) => dep !== activeDepartment)
                              .map((dep) => (
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
                              setSuspendReload(false);
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
                            setSuspendReload(true);
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
              <form onSubmit={saveRecurring} className="bg-gray-800 p-4 rounded space-y-3">
                <h3 className="font-bold text-lg mb-2">
                  {recForm.id ? "Vorlage bearbeiten" : "Neues wiederkehrendes Task"} ({activeDepartment})
                </h3>
                <input
                  className="w-full p-2 bg-gray-700 rounded"
                  placeholder="Titel"
                  value={recForm.titel}
                  onChange={(e) => setRecForm({ ...recForm, titel: e.target.value })}
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
                      onChange={(e) => setRecForm({ ...recForm, zeit: e.target.value })}
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
                      <label className="text-xs text-gray-400">Datum (einmalig)</label>
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
                    <label className="text-xs text-gray-400">Vorlauf (Minuten)</label>
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
                    <label className="text-xs text-gray-400">Cooldown (Stunden)</label>
                    <input
                      className="w-full p-2 bg-gray-700 rounded"
                      type="number"
                      min="0"
                      value={recForm.cooldownHours}
                      onChange={(e) =>
                        setRecForm({ ...recForm, cooldownHours: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400">Anleitung (URL oder Datei)</label>
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
                    onChange={(e) => setRecUploadFile(e.target.files?.[0] ?? null)}
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
                <h3 className="font-bold text-lg mb-2">Wiederkehrende Tasks – Vorlagen</h3>
                {recList.length === 0 && (
                  <div className="text-sm text-gray-400">Keine Vorlagen vorhanden.</div>
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
                              {" "} |{" "}
                              <a
                                href={absUploadUrl(t.anleitungUrl)}
                                target="_blank"
                                className="text-blue-400 underline"
                              >
                                Anleitung
                              </a>
                            </>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">
                          angelegt von {t.createdBy || "unbekannt"} · {fmtDateTime(t.createdAt)}
                          {" "}| Vorlauf: {t.vorlaufMin ?? 0} min · Cooldown: {t.cooldownHours ?? 0} h
                        </div>
                        {t.beschreibung && (
                          <div className="text-xs text-gray-400 mt-1">{t.beschreibung}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => editRecurring(t)}
                          className="bg-yellow-600 text-xs px-2 py-1 rounded"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => deleteRecurring(t.id)}
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
              <div className="text-sm text-gray-300">{preview.name || "Anhang"}</div>
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
