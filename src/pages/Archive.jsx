// src/pages/Archive.jsx
import { useEffect, useMemo, useState } from "react";
import { Data } from "../api";

const DEPARTMENTS = ["Leitstand", "Technik", "Qualität", "Logistik"];
const TYPES = ["tasks", "meldungen"];
const DAY_FILTERS = [
  { value: "all", label: "Alle Zeiträume" },
  { value: "today", label: "Heute" },
  { value: "yesterday", label: "Gestern" },
  { value: "last7", label: "Letzte 7 Tage" },
];

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE");
  } catch {
    return String(iso);
  }
}

export default function Archive({ onClose }) {
  const [abteilung, setAbteilung] = useState(DEPARTMENTS[0]);
  const [typ, setTyp] = useState("tasks");
  const [day, setDay] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Daten laden
  async function load() {
    setLoading(true);
    setError("");
    try {
      const query = { status: "erledigt", sort: "desc" };
      if (day !== "all") query.day = day; // ← serverseitiger Tagesfilter
      const data = await Data.list(abteilung, typ, query);
      setItems(Array.isArray(data) ? data : []);
      setPage(1); // bei neuem Load auf Seite 1
    } catch (e) {
      setError(e?.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abteilung, typ, day]);

  // Suche/Filter (clientseitig)
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => {
      return (
        String(it.titel || "").toLowerCase().includes(s) ||
        String(it.beschreibung || "").toLowerCase().includes(s) ||
        String(it.kategorie || "").toLowerCase().includes(s) ||
        String(it.priorität || "").toLowerCase().includes(s) ||
        String(it.erledigtVon || "").toLowerCase().includes(s)
      );
    });
  }, [items, search]);

  // Paging berechnen
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageItems = filtered.slice(startIdx, endIdx);

  useEffect(() => {
    // wenn page > totalPages (z.B. nach Filterwechsel), zurückkorrigieren
    if (page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  async function restore(it) {
    try {
      await Data.toggleComplete(abteilung, typ, it.id ?? it._index ?? 0, {
        completed: false,
        erledigtVon: localStorage.getItem("username") || "unbekannt",
      });
      setItems((prev) =>
        prev.filter(
          (x) => (x.id || x._index) !== (it.id || it._index)
        )
      );
    } catch (e) {
      alert(e?.message || "Konnte nicht wieder öffnen");
    }
  }

  async function remove(it) {
    if (!confirm(`Wirklich löschen?\n"${it.titel || it.id}"`)) return;
    try {
      await Data.remove(abteilung, typ, it.id ?? it._index ?? 0);
      setItems((prev) =>
        prev.filter(
          (x) => (x.id || x._index) !== (it.id || it._index)
        )
      );
    } catch (e) {
      alert(e?.message || "Konnte nicht löschen");
    }
  }


  // CSV Export
  function exportCSV() {
    if (!filtered.length) return;
    const header = [
      "Titel",
      "Beschreibung",
      "Kategorie",
      "Priorität",
      "Erstellt",
      "Erledigt",
      "Erledigt von"
    ];
    const rows = filtered.map(it => [
      '"' + (it.titel || '').replace(/"/g, '""') + '"',
      '"' + (it.beschreibung || '').replace(/"/g, '""') + '"',
      '"' + (it.kategorie || '').replace(/"/g, '""') + '"',
      '"' + (it.priorität || '').replace(/"/g, '""') + '"',
      '"' + fmtDate(it.createdAt || it.erstelltAm) + '"',
      '"' + fmtDate(it.completedAt) + '"',
      '"' + (it.erledigtVon || '') + '"',
    ]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `archiv_export_${abteilung}_${typ}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 flex items-center justify-center p-4">
      {/* Panel */}
      <div className="w-full max-w-6xl bg-white/95 rounded-3xl shadow-2xl h-[92vh] flex flex-col overflow-hidden border-4 border-gray-900">
        {/* Header */}
        <div className="px-8 py-5 border-b flex flex-col md:flex-row md:items-center md:justify-between bg-white/90 backdrop-blur gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c1.657 0 3-1.343 3-3S13.657 2 12 2 9 3.343 9 5s1.343 3 3 3zm0 2c-2.21 0-4 1.79-4 4v5h8v-5c0-2.21-1.79-4-4-4z" /></svg>
              Archiv
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Erledigte Einträge durchsuchen, wieder öffnen oder löschen.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportCSV}
              className="px-4 py-2 rounded-lg border border-blue-600 bg-blue-600 text-white font-semibold shadow-sm hover:bg-blue-700 transition"
              title="Als CSV exportieren"
            >
              CSV Export
            </button>
            <button
              onClick={load}
              className="px-4 py-2 rounded-lg border shadow-sm hover:bg-gray-50 font-semibold"
              title="Aktualisieren"
            >
              Aktualisieren
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border bg-gray-900 text-white font-semibold hover:bg-gray-800 transition"
              title="Schließen"
            >
              Schließen
            </button>
          </div>
        </div>

        {/* Filter-Zeile */}
        <div className="px-8 py-4 border-b bg-white/80">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <select
              className="border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
              value={abteilung}
              onChange={(e) => setAbteilung(e.target.value)}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              className="border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
              value={typ}
              onChange={(e) => setTyp(e.target.value)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              className="border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            >
              {DAY_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <input
              className="border-2 border-gray-300 rounded-lg px-3 py-2 md:col-span-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
              placeholder="Suche: Titel, Beschreibung, Kategorie, Priorität, Erledigt von…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />

            <div className="flex items-center justify-between md:justify-end gap-2">
              <label className="text-sm text-gray-600">pro Seite</label>
              <select
                className="border-2 border-gray-300 rounded-lg px-2 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) || 10);
                  setPage(1);
                }}
              >
                {[10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Info-Zeile */}
          <div className="mt-3 text-xs text-gray-500 flex items-center gap-3">
            <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700">
              Zeitraum: <b>{day !== "all" ? DAY_FILTERS.find((d) => d.value === day)?.label : "Alle"}</b>
            </span>
            <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-gray-100 border">
              Abteilung: <b>{abteilung}</b>
            </span>
            <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-gray-100 border">
              Typ: <b>{typ}</b>
            </span>
            {search.trim() && (
              <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700">
                Suche: <b>{search}</b>
              </span>
            )}
          </div>
        </div>

        {/* Inhalt / Scrollbereich */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {error && <div className="mb-3 text-red-600 text-sm">{error}</div>}

            {loading ? (
              <div className="py-10 text-center text-gray-500">Lade…</div>
            ) : total === 0 ? (
              <div className="py-10 text-center text-gray-500">
                Keine erledigten Einträge gefunden.
              </div>
            ) : (
              <>
                {/* Ergebnis-Info */}
                <div className="mb-3 text-sm text-gray-600">
                  Zeige <b>{startIdx + 1}</b>–<b>{endIdx}</b> von <b>{total}</b>
                </div>

                {/* Liste */}
                <ul className="space-y-3">
                  {pageItems.map((it) => (
                    <li
                      key={it.id || it._index}
                      className="border rounded-xl p-4 hover:shadow-sm transition bg-white"
                    >
                      <div className="flex flex-wrap items-start gap-3 justify-between">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {it.titel || "Ohne Titel"}
                          </div>
                          <div className="text-sm text-gray-600 mt-0.5 line-clamp-2">
                            {it.beschreibung || "—"}
                          </div>

                          <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                            <span>
                              Kategorie: <b>{it.kategorie || "—"}</b>
                            </span>
                            <span>
                              Priorität: <b>{it.priorität || "—"}</b>
                            </span>
                            <span>
                              Erstellt:{" "}
                              <b>{fmtDate(it.createdAt || it.erstelltAm)}</b>
                            </span>
                            <span>
                              Erledigt: <b>{fmtDate(it.completedAt)}</b>
                            </span>
                            <span>
                              Erledigt von: <b>{it.erledigtVon || "—"}</b>
                            </span>
                            {it.templateId && (
                              <span className="px-1.5 py-0.5 rounded bg-gray-100 border text-gray-700">
                                Wiederkehrend
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => restore(it)}
                            className="px-3 py-1.5 rounded-lg border hover:bg-gray-50"
                            title="Wieder öffnen"
                          >
                            Wieder öffnen
                          </button>
                          <button
                            onClick={() => remove(it)}
                            className="px-3 py-1.5 rounded-lg border bg-red-600 text-white hover:bg-red-700"
                            title="Endgültig löschen"
                          >
                            Löschen
                          </button>
                        </div>
                      </div>

                      {(it.notizen?.length || it.anhaenge?.length) ? (
                        <div className="mt-3 grid md:grid-cols-2 gap-3">
                          {it.notizen?.length ? (
                            <div className="border rounded-lg p-2">
                              <div className="text-xs font-semibold mb-1">
                                Notizen
                              </div>
                              <ul className="text-sm space-y-1 max-h-28 overflow-auto">
                                {it.notizen.map((n, idx) => (
                                  <li
                                    key={idx}
                                    className="flex justify-between gap-3"
                                  >
                                    <span className="truncate">• {n.text}</span>
                                    <span className="text-xs text-gray-500">
                                      {n.zeit}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {it.anhaenge?.length ? (
                            <div className="border rounded-lg p-2">
                              <div className="text-xs font-semibold mb-1">
                                Anhänge
                              </div>
                              <ul className="text-sm space-y-1">
                                {it.anhaenge.map((a, idx) => (
                                  <li key={idx}>
                                    <a
                                      href={a.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="underline break-all"
                                    >
                                      {a.name || a.url}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {/* Pagination */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-gray-600">
                    Seite <b>{safePage}</b> / <b>{totalPages}</b>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-1.5 rounded-lg border disabled:opacity-50"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Zurück
                    </button>
                    <div className="hidden md:flex items-center gap-1">
                      {Array.from({ length: totalPages }).slice(0, 7).map((_, i) => {
                        const n = i + 1;
                        return (
                          <button
                            key={n}
                            onClick={() => setPage(n)}
                            className={`px-3 py-1.5 rounded-lg border ${
                              n === safePage
                                ? "bg-gray-900 text-white"
                                : "bg-white hover:bg-gray-50"
                            }`}
                          >
                            {n}
                          </button>
                        );
                      })}
                      {totalPages > 7 && (
                        <span className="px-2 text-gray-500">…</span>
                      )}
                    </div>
                    <button
                      className="px-3 py-1.5 rounded-lg border disabled:opacity-50"
                      disabled={safePage >= totalPages}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                    >
                      Weiter
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
