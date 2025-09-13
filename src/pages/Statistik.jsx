import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const DEPARTMENTS = ["Leitstand", "Technik", "Qualität", "Logistik"];

function BarChart({ title, labels, values, height = 160, gradientFrom = '#f97316', gradientTo = '#f59e0b', idPrefix = 'g1' }) {
  const max = Math.max(...values, 1);
  const width = Math.max(320, labels.length * 100);
  const barWidth = Math.floor((width - 40) / labels.length);
  // Add explicit top and bottom padding so value labels don't get clipped
  const topPad = 24;
  const bottomPad = 28;
  const svgHeight = height + topPad + bottomPad;
  const gradId = `grad-${idPrefix}`;
  return (
    <div className="rounded p-3 shadow-sm" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))' }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-md font-semibold text-gray-100">{title}</h3>
        <div className="text-sm text-gray-400">Max: {max}</div>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${svgHeight}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={gradientFrom} stopOpacity="0.95" />
            <stop offset="100%" stopColor={gradientTo} stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <g transform={`translate(20,${topPad})`}>
          {values.map((v, i) => {
            const h = (v / max) * height;
            const x = i * barWidth + i * 6;
            const y = height - h;
            return (
              <g key={i}>
                <rect x={x} y={y} width={barWidth} height={h} rx={6} fill={`url(#${gradId})`} />
                <text x={x + barWidth / 2} y={height + bottomPad - 6} fontSize="12" fill="#cbd5e1" textAnchor="middle">{labels[i]}</text>
                <text x={x + barWidth / 2} y={y - 8} fontSize="11" fill="#fde68a" textAnchor="middle">{v}</text>
              </g>
            );
          })}
          <line x1={0} y1={height} x2={Math.max(1, labels.length * (barWidth + 6))} y2={height} stroke="#334155" strokeWidth={1} />
        </g>
      </svg>
    </div>
  );
}

function Avatar() {
  // generic avatar for privacy — no initials or names shown
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold bg-gray-600">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zM12 14c-4.418 0-8 1.791-8 4v2h16v-2c0-2.209-3.582-4-8-4z" />
      </svg>
    </div>
  );
}

export default function Statistik() {
  const navigate = useNavigate();
  const [data, setData] = useState({ areas: [], employees: [], assignments: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  const [deptTasks, setDeptTasks] = useState({});
  const [deptRecurring, setDeptRecurring] = useState({});
  const [chartLoading, setChartLoading] = useState(false);

  const loadEinteilung = async () => {
    setLoading(true);
    setError(null);
    try {
      // try server first
      const res = await fetch('/api/einteilung/containers', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        const stored = json && json.stored ? json.stored : json;
        if (stored) {
          setData({
            areas: Array.isArray(stored.areas) ? stored.areas : [],
            employees: Array.isArray(stored.employees) ? stored.employees : [],
            assignments: stored.assignments || {},
          });
          setLastLoadedAt(new Date().toISOString());
          setLoading(false);
          return;
        }
      }
      // fallback to localStorage
      try {
        const raw = localStorage.getItem('einteilung:containers');
        if (raw) {
          const parsed = JSON.parse(raw);
          setData({
            areas: Array.isArray(parsed.areas) ? parsed.areas : [],
            employees: Array.isArray(parsed.employees) ? parsed.employees : [],
            assignments: parsed.assignments || {},
          });
          setLastLoadedAt(new Date().toISOString());
        } else {
          setData({ areas: [], employees: [], assignments: {} });
        }
      } catch (e) {
        setError('Fehler beim Lesen von localStorage');
      }
    } catch (e) {
      setError('Fehler beim Laden der Einteilung');
    } finally {
      setLoading(false);
    }
  };

  const loadDeptTasks = async () => {
    setChartLoading(true);
    try {
      const promises = DEPARTMENTS.map(async (dep) => {
        try {
          const res = await fetch(`/api/${encodeURIComponent(dep)}/tasks`, { credentials: 'include' });
          if (!res.ok) return { dep, count: 0, recurring: 0 };
          const js = await res.json();
          const arr = Array.isArray(js) ? js : js?.items || [];
          // count only tasks that are assigned and not completed
          const count = arr.filter((it) => {
            if (!it) return false;
            // exclude recurring materialized tasks (user requested)
            if (it.fromRecurring) return false;
            // only count tasks that are explicitly assigned to a department/user
            // consider zielAbteilung or weitergeleitetAn or a non-null assignment flag
            const hasAssignedTarget = !!(it.zielAbteilung || it.weitergeleitetAn || it.assignedTo || it.assigned);
            if (!hasAssignedTarget) return false;
            if (it.completed === true) return false;
            const s = (it.status || '').toString().toLowerCase();
            if (s === 'erledigt' || s === 'done' || s === 'closed') return false;
            return true;
          }).length;
          // count recurring (only open ones) separately
          const recurring = arr.filter((it) => {
            if (!it) return false;
            if (!it.fromRecurring) return false;
            if (it.completed === true) return false;
            const s = (it.status || '').toString().toLowerCase();
            if (s === 'erledigt' || s === 'done' || s === 'closed') return false;
            return true;
          }).length;
          return { dep, count, recurring };
        } catch (e) {
          return { dep, count: 0, recurring: 0 };
        }
      });
      const results = await Promise.all(promises);
      const map = {};
      const recMap = {};
      results.forEach(r => map[r.dep] = r.count);
      results.forEach(r => recMap[r.dep] = typeof r.recurring === 'number' ? r.recurring : 0);
      setDeptTasks(map);
      setDeptRecurring(recMap);
    } catch (e) {
      // ignore
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    loadEinteilung();
    loadDeptTasks();
    const id = setInterval(() => {
      loadEinteilung();
      loadDeptTasks();
    }, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // derived metrics
  const employees = data.employees || [];
  const assignments = data.assignments || {};
  const areas = data.areas || [];

  const totalEmployees = employees.length;
  const assignedSet = new Set(Object.entries(assignments).filter(([empId, areaId]) => areaId).map(([empId]) => empId));
  const assignedCount = employees.filter(e => assignedSet.has(e.id)).length;
  const unassignedCount = Math.max(0, totalEmployees - assignedCount);

  const areaStats = areas.map(a => ({
    id: a.id,
    label: a.label || a.id,
    count: Array.isArray(a.members) ? a.members.length : 0,
    capacity: (a.capacity !== undefined && a.capacity !== null && Number.isFinite(Number(a.capacity))) ? Number(a.capacity) : null,
  }));

  const KPIs = [
    { label: 'Gesamt Mitarbeitende', value: totalEmployees || 0, color: 'from-indigo-500 to-indigo-700', icon: '👥' },
    { label: 'Eingesetzt', value: assignedCount || 0, color: 'from-emerald-500 to-emerald-700', icon: '🟢' },
    { label: 'Nicht eingesetzt', value: unassignedCount || 0, color: 'from-rose-500 to-rose-600', icon: '⚪' },
    { label: 'Bereiche', value: areas.length || 0, color: 'from-sky-500 to-sky-700', icon: '🗂️' },
  ];

  const taskLabels = DEPARTMENTS;
  const taskValues = taskLabels.map(l => deptTasks[l] || 0);

  const areaLabels = areaStats.map(a => a.label);
  const areaValues = areaStats.map(a => a.count);

  // Panels order + drag & drop handlers to let user rearrange/horizontally display sections
  const [panelOrder, setPanelOrder] = useState(['kpis', 'charts', 'areas', 'employees']);

  const onDragStartPanel = (e, key) => {
    try { e.dataTransfer.setData('text/plain', key); }
    catch (e) {}
  };
  const onDragOverPanel = (e) => { e.preventDefault(); };
  const onDropPanel = (e, targetKey) => {
    e.preventDefault();
    try {
      const srcKey = e.dataTransfer.getData('text/plain');
      if (!srcKey || srcKey === targetKey) return;
      const newOrder = [...panelOrder];
      const from = newOrder.indexOf(srcKey);
      const to = newOrder.indexOf(targetKey);
      if (from === -1 || to === -1) return;
      newOrder.splice(from, 1);
      newOrder.splice(to, 0, srcKey);
      setPanelOrder(newOrder);
    } catch (e) {}
  };

  // auto-scaling kept from previous iteration (lightweight)
  const containerRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const [scale, setScale] = useState(1);
  React.useEffect(() => {
    let mounted = true;
    const computeScale = () => {
      try {
        const c = containerRef.current; const content = contentRef.current; if (!c || !content) return;
        const avail = Math.max(100, c.clientWidth - 48);
        const needed = content.scrollWidth || content.offsetWidth || 0;
        let next = 1; if (needed > avail) next = Math.max(0.5, avail / needed);
        if (!mounted) return; setScale(next);
        const contentHeight = content.scrollHeight || content.offsetHeight || 0; c.style.height = `${Math.ceil(contentHeight * next) + 20}px`;
      } catch (e) {}
    };
    computeScale(); const onResize = () => computeScale(); window.addEventListener('resize', onResize);
    const obs = new MutationObserver(() => computeScale()); if (contentRef.current) obs.observe(contentRef.current, { childList: true, subtree: true, attributes: true });
    return () => { mounted = false; window.removeEventListener('resize', onResize); try { obs.disconnect(); } catch (e) {} };
  }, [panelOrder, JSON.stringify(areaStats), JSON.stringify(taskValues), employees.length]);

  return (
    <div className="min-h-screen text-white" style={{ background: 'linear-gradient(180deg,#0f172a 0%, #020617 100%)' }}>

      {/* Hero/Header */}
      <div className="px-8 pt-8 pb-6">
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-4xl font-extrabold text-white leading-tight">Statistik & KPIs</h1>
              <p className="mt-2 text-gray-100/80">Übersicht von Einteilung und Aufgaben — live und automatisch aktualisiert.</p>
              <div className="mt-4 flex items-center gap-3">
                <button onClick={() => { loadEinteilung(); loadDeptTasks(); }} className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-md">
                  Aktualisieren
                </button>
                <div className="text-sm text-white/80">{lastLoadedAt ? `Zuletzt: ${new Date(lastLoadedAt).toLocaleString('de-DE')}` : ''}</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-white/6 p-3 rounded-lg text-right">
                <div className="text-xs text-white/80">Server-Status</div>
                <div className="text-sm font-semibold text-green-300">Online</div>
              </div>
              <div className="bg-white/6 p-3 rounded-lg text-right">
                <div className="text-xs text-white/80">Clients</div>
                <div className="text-sm font-semibold text-yellow-200">–</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="px-8 pb-12">
        <div ref={containerRef} className="w-full overflow-hidden py-2">
          <div ref={contentRef} style={{ display: 'flex', gap: '1rem', transform: `scale(${scale})`, transformOrigin: 'left top', width: 'max-content', marginLeft: '1mm' }}>

            {panelOrder.map((key) => {
              if (key === 'kpis') {
                return (
                  <div key={key} draggable onDragStart={(e) => onDragStartPanel(e, key)} onDragOver={onDragOverPanel} onDrop={(e) => onDropPanel(e, key)} className="min-w-[320px] flex-shrink-0">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-1">
                      {KPIs.map((kpi, idx) => (
                        <div key={idx} className={`rounded-xl p-4 shadow-lg ring-1 ring-white/6`} style={{ background: `linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))` }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white text-lg font-bold bg-gradient-to-br ${kpi.color}`}>
                                <span className="text-xl">{kpi.icon}</span>
                              </div>
                              <div>
                                <div className="text-sm text-gray-300">{kpi.label}</div>
                                <div className="text-2xl font-extrabold text-white">{kpi.value}</div>
                              </div>
                            </div>
                            <div className="text-xs text-gray-400">&nbsp;</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              if (key === 'charts') {
                return (
                  <div key={key} draggable onDragStart={(e) => onDragStartPanel(e, key)} onDragOver={onDragOverPanel} onDrop={(e) => onDropPanel(e, key)} className="min-w-[640px] flex-shrink-0">
                    <div className="rounded-2xl p-4 shadow-2xl ring-1 ring-white/6 bg-gradient-to-b from-white/2 to-white/1">
                      <h3 className="text-lg font-semibold text-gray-100 mb-3">Aufgaben & Auslastung</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <BarChart idPrefix="assigned" title="Tasks zugewiesen pro Abteilung" labels={taskLabels} values={taskValues} gradientFrom="#06b6d4" gradientTo="#0ea5e9" />
                        </div>
                        <div>
                          <BarChart idPrefix="recurring" title="Wiederkehrende Tasks pro Abteilung" labels={taskLabels} values={taskLabels.map(l => deptRecurring[l] || 0)} gradientFrom="#7c3aed" gradientTo="#a78bfa" />
                        </div>
                        <div className="md:col-span-2">
                          <BarChart idPrefix="areas" title="Eingesetzte Mitarbeitende pro Bereich" labels={areaLabels.length ? areaLabels : ['-']} values={areaValues.length ? areaValues : [0]} gradientFrom="#f97316" gradientTo="#f59e0b" />
                        </div>
                      </div>

                      {/* Diagnostic hint when charts are empty */}
                      {!chartLoading && taskValues.every(v => v === 0) && Object.values(deptRecurring).every(v => v === 0) && (
                        <div className="mt-3 text-sm text-yellow-300">
                          Keine Statistik‑Werte empfangen. Prüfe bitte:
                          <ul className="mt-1 ml-4 list-disc text-xs text-yellow-200">
                            <li>Ist das Backend gestartet? (http://localhost:4000)</li>
                            <li>Stimmen die Netzwerk‑Requests in der Browserkonsole (Netzwerk → /api/*)?</li>
                            <li>Gibt es CORS‑ oder Auth‑Fehler in der Konsole?</li>
                          </ul>
                          <div className="mt-2">
                            <button onClick={() => { loadEinteilung(); loadDeptTasks(); }} className="px-3 py-1 bg-white/10 rounded">Erneut laden</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              if (key === 'areas') {
                return (
                  <div key={key} draggable onDragStart={(e) => onDragStartPanel(e, key)} onDragOver={onDragOverPanel} onDrop={(e) => onDropPanel(e, key)} className="min-w-[360px] flex-shrink-0">
                    <div className="rounded-xl p-4 shadow-lg ring-1 ring-white/6 bg-gray-800/40">
                      <h3 className="text-lg font-semibold text-gray-100 mb-3">Bereiche & Kapazität</h3>
                      <div className="space-y-3">
                        {areaStats.length === 0 && <div className="text-gray-400">Keine Bereiche vorhanden.</div>}
                        {areaStats.map(a => {
                          const pct = a.capacity ? Math.round((a.count / a.capacity) * 100) : null;
                          return (
                            <div key={a.id} className="p-2 bg-gray-900 rounded">
                              <div className="flex items-center justify-between mb-1">
                                <div>
                                  <div className="font-medium text-gray-100">{a.label}</div>
                                  <div className="text-xs text-gray-400">{a.count} / {a.capacity !== null ? a.capacity : '–'}</div>
                                </div>
                                <div className="text-sm font-semibold text-yellow-300">{pct !== null ? `${pct}%` : '–'}</div>
                              </div>
                              <div className="w-full h-2 rounded bg-gray-700 overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600" style={{ width: `${pct !== null ? Math.min(100, Math.max(0, pct)) : 100}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              if (key === 'employees') {
                return (
                  <div key={key} draggable onDragStart={(e) => onDragStartPanel(e, key)} onDragOver={onDragOverPanel} onDrop={(e) => onDropPanel(e, key)} className="min-w-[360px] flex-shrink-0">
                    <div className="rounded-xl p-4 shadow-lg ring-1 ring-white/6 bg-gray-800/30">
                      <h3 className="text-lg font-semibold text-gray-100 mb-3">Mitarbeitende</h3>

                      {/* Aggregated summary for privacy: e.g. "Mitarbeitende 5/10 eingesetzt" */}
                      <div className="p-3 bg-gray-900 rounded">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-gray-300">Eingesetzt</div>
                            <div className="text-2xl font-extrabold text-white">{assignedCount}/{totalEmployees} eingesetzt</div>
                          </div>
                          <div className="text-sm text-gray-400">&nbsp;</div>
                        </div>
                        <div className="mt-3 w-full bg-gray-700 rounded h-3 overflow-hidden">
                          <div className="h-full bg-emerald-400" style={{ width: `${totalEmployees ? Math.round((assignedCount / totalEmployees) * 100) : 0}%` }} />
                        </div>
                      </div>

                    </div>
                  </div>
                );
              }

              return null;
            })}

          </div>
        </div>

        <div className="mt-8 text-xs text-gray-400 px-2">
          {error && <div className="text-red-400 mb-2">{error}</div>}
          {lastLoadedAt && <div>Letzte Einteilungsladung: {new Date(lastLoadedAt).toLocaleString('de-DE')}</div>}
        </div>

      </div>
    </div>
  );
}
