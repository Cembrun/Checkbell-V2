import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketProvider';

export default function EinteilungContainer({ inline = false, onClose, user } = {}) {
  const navigate = useNavigate();

  // start with no areas — user will add their own
  const [areas, setAreas] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [saveStatus, setSaveStatus] = useState('');
  const [editingFunkId, setEditingFunkId] = useState(null);
  const [editingFunkValue, setEditingFunkValue] = useState('');
  const [lastServerReload, setLastServerReload] = useState(null);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeFunk, setNewEmployeeFunk] = useState('');
  const [showAddArea, setShowAddArea] = useState(false);
  const [newAreaLabel, setNewAreaLabel] = useState('');
  const [newAreaCapacity, setNewAreaCapacity] = useState('');
  const [pendingDeleteEmployeeId, setPendingDeleteEmployeeId] = useState(null);
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const [autoTeamFilter, setAutoTeamFilter] = useState('all');
  const [autoStrategy, setAutoStrategy] = useState('fill');
  const [autoGlobalMax, setAutoGlobalMax] = useState('');
  const [autoBalance, setAutoBalance] = useState(false);
  // selected area for the compact inline widget
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const socket = useSocket();
  const canEdit = !(user && user.role === 'viewer');
  // per-client id to avoid applying our own broadcasts
  const clientId = useMemo(() => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,6), []);
  const [lastRemoteUpdateAt, setLastRemoteUpdateAt] = useState(null);

  // load from localStorage if present
  useEffect(() => {
    try {
      const raw = localStorage.getItem('einteilung:containers');
      if (raw) {
        const parsed = JSON.parse(raw);
  if (Array.isArray(parsed.areas) && parsed.areas.length) setAreas(parsed.areas.map(a => ({ ...a, members: Array.isArray(a.members) ? a.members : [] })));
  if (Array.isArray(parsed.employees)) setEmployees(parsed.employees.map(e => ({ ...e, assignCount: Number.isFinite(Number(e?.assignCount)) ? Number(e.assignCount) : 0, lastAssignedAt: e?.lastAssignedAt || null })));
        if (parsed.assignments) setAssignments(parsed.assignments);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // try to load the canonical persisted layout from the server on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/einteilung/containers', { credentials: 'include' });
        if (!res.ok) return;
        const json = await res.json();
        const stored = json && json.stored ? json.stored : json;
        if (!stored || !mounted) return;
        // apply server state (areas, employees, assignments) if present
  if (Array.isArray(stored.areas) && stored.areas.length) setAreas(stored.areas.map(a => ({ ...a, members: Array.isArray(a.members) ? a.members : [] })));
  if (Array.isArray(stored.employees)) setEmployees(stored.employees.map(e => ({ ...e, assignCount: Number.isFinite(Number(e?.assignCount)) ? Number(e.assignCount) : 0, lastAssignedAt: e?.lastAssignedAt || null })));
        if (stored.assignments) setAssignments(stored.assignments);
        // persist a local copy so this window has the same baseline
        try { localStorage.setItem('einteilung:containers', JSON.stringify(stored)); } catch (e) {}
    setSaveStatus('Vom Server geladen');
    setLastServerReload(new Date().toISOString());
        setTimeout(() => setSaveStatus(''), 1400);
      } catch (e) {
        // server not reachable — keep localStorage values
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Small client-side defaults (useful when server/local state is empty)
  const DEFAULT_AREAS = [
    { id: 'area_ug', label: 'UG', members: [], fixed: true },
    { id: 'area_eg', label: 'EG/EGZG', members: [], fixed: true },
    { id: 'area_1og', label: '1.OG', members: [], fixed: true },
    { id: 'area_2og', label: '2.OG', members: [], fixed: true }
  ];

  const loadDefaultAreas = () => {
    setAreas(DEFAULT_AREAS.map(a => ({ ...a, members: Array.isArray(a.members) ? [...a.members] : [] })));
    // reset assignments for simplicity
    const nextAssignments = {};
    setAssignments(nextAssignments);
    // broadcast that we added defaults so other clients see them
    broadcastUpdate({ areas: DEFAULT_AREAS, assignments: nextAssignments, employees });
  };

  const reloadFromServer = async () => {
    try {
      const res = await fetch('/api/einteilung/containers', { credentials: 'include' });
      if (!res.ok) return false;
      const json = await res.json();
      const stored = json && json.stored ? json.stored : json;
      if (!stored) return false;
  if (Array.isArray(stored.areas) && stored.areas.length) setAreas(stored.areas.map(a => ({ ...a, members: Array.isArray(a.members) ? a.members : [] })));
  if (Array.isArray(stored.employees)) setEmployees(stored.employees.map(e => ({ ...e, assignCount: Number.isFinite(Number(e?.assignCount)) ? Number(e.assignCount) : 0, lastAssignedAt: e?.lastAssignedAt || null })));
      if (stored.assignments) setAssignments(stored.assignments);
      try { localStorage.setItem('einteilung:containers', JSON.stringify(stored)); } catch (e) {}
  setSaveStatus('Vom Server geladen');
  setLastServerReload(new Date().toISOString());
      setTimeout(() => setSaveStatus(''), 1400);
      return true;
    } catch (e) {
      return false;
    }
  };

  

  // persist quick snapshot on save
  const persist = (note) => {
    try {
      const payload = { areas, employees, assignments, note };
      localStorage.setItem('einteilung:containers', JSON.stringify(payload));
      setSaveStatus('Gespeichert');
      setTimeout(() => setSaveStatus(''), 1400);
    } catch (e) {
      setSaveStatus('Fehler beim Speichern');
      setTimeout(() => setSaveStatus(''), 2000);
    }
  };

  // Emit an update to other clients via socket and optionally include clientId and timestamp
  const broadcastUpdate = async (payload) => {
    const stamped = { ...(payload || {}), updatedAt: new Date().toISOString(), clientId };
    // Socket.IO temporarily disabled - no realtime updates
    console.log('[EinteilungContainer] Socket disabled - skipping realtime broadcast');
  };

  const handleSaveClick = async () => {
    persist('manuell');
    await saveToServer('manuell');
  };

  // remove all members from areas and clear assignments
  const unassignAll = () => {
    if (!window.confirm('Alle Mitarbeitenden aus allen Bereichen wirklich auflösen?')) return;
    const nextAreas = (areas || []).map(a => ({ ...a, members: [] }));
    const nextAssignments = {};
    setAreas(nextAreas);
    setAssignments(nextAssignments);
    // broadcast and persist
    broadcastUpdate({ areas: nextAreas, assignments: nextAssignments, employees });
    autoSave('unassign-all');
    setSaveStatus('Alle Mitarbeitenden aufgelöst');
    setTimeout(() => setSaveStatus(''), 1800);
  };

  // Drag & drop handlers
  const onDragStart = (e, id) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const onDropToArea = (e, areaId) => {
    e.preventDefault();
    const empId = e.dataTransfer.getData('text/plain');
    if (!empId) return;
    const nextAreas = areas.map(a => ({ ...a, members: Array.isArray(a.members) ? [...a.members] : [] }));
    // remove from previous area
    for (const a of nextAreas) a.members = a.members.filter(m => m !== empId);
    const target = nextAreas.find(a => a.id === areaId);
    if (target) target.members.push(empId);
    const nextAssignments = { ...assignments, [empId]: areaId };
    setAreas(nextAreas);
    setAssignments(nextAssignments);
  // broadcast local change
  broadcastUpdate({ areas: nextAreas, assignments: nextAssignments, employees });
  // auto-save changes to server (debounced)
  autoSave();
  };

  const onDropToList = (e) => {
    e.preventDefault();
    const empId = e.dataTransfer.getData('text/plain');
    if (!empId) return;
    const nextAreas = areas.map(a => ({ ...a, members: (a.members || []).filter(m => m !== empId) }));
    const nextAssignments = { ...assignments }; nextAssignments[empId] = null;
    setAreas(nextAreas);
    setAssignments(nextAssignments);
  broadcastUpdate({ areas: nextAreas, assignments: nextAssignments, employees });
  autoSave();
  };

  // Area reordering: drag & drop areas themselves
  const onAreaDragStart = (e, id) => {
    if (!id) return;
    e.dataTransfer.setData('text/area-id', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onAreaDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const onAreaDropReorder = (e, targetId) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/area-id');
    if (!draggedId || draggedId === targetId) return;
    const srcIdx = (areas || []).findIndex(a => a.id === draggedId);
    const dstIdx = (areas || []).findIndex(a => a.id === targetId);
    if (srcIdx === -1 || dstIdx === -1) return;
    // don't allow reordering fixed areas
    const srcArea = areas[srcIdx];
    const dstArea = areas[dstIdx];
    if (srcArea?.fixed || dstArea?.fixed) return;
    const next = [...areas];
    const [item] = next.splice(srcIdx, 1);
    // insert at destination index
    next.splice(dstIdx, 0, item);
    setAreas(next);
    broadcastUpdate({ areas: next, assignments, employees });
    autoSave('reorder-areas');
  };

  const moveArea = (id, dir) => {
    const idx = (areas || []).findIndex(a => a.id === id);
    if (idx === -1) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= (areas || []).length) return;
    const srcArea = areas[idx];
    const dstArea = areas[targetIdx];
    if (srcArea?.fixed || dstArea?.fixed) return;
    const next = [...areas];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setAreas(next);
    broadcastUpdate({ areas: next, assignments, employees });
    autoSave('reorder-areas');
  };

  const addEmployee = () => {
  // kept for backward-compat if called programmatically
  const name = newEmployeeName?.trim();
  if (!name) return;
  const id = 'u' + Date.now();
  const emp = { id, name, funk: newEmployeeFunk || '', assignCount: 0, lastAssignedAt: null };
  const nextEmployees = employees.concat(emp);
  setEmployees(nextEmployees);
  // clear form
  setNewEmployeeName('');
  setNewEmployeeFunk('');
  setShowAddEmployee(false);
  // broadcast update with the new list
  broadcastUpdate({ areas, assignments, employees: nextEmployees });
  autoSave();
  };

  

  // helper used by the inline widget to assign/unassign an employee to the selected area
  const assignEmployeeToArea = (empId, areaId) => {
    const nextAreas = areas.map(a => ({ ...a, members: Array.isArray(a.members) ? [...a.members] : [] }));
    // remove from previous area
    for (const a of nextAreas) a.members = a.members.filter(m => m !== empId);
    if (areaId) {
      const target = nextAreas.find(a => a.id === areaId);
      if (target) target.members.push(empId);
    }
    const nextAssignments = { ...assignments, [empId]: areaId || null };
    setAreas(nextAreas);
    setAssignments(nextAssignments);
    broadcastUpdate({ areas: nextAreas, assignments: nextAssignments, employees });
  autoSave();
  };

  const editEmployeeFunk = (id) => {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    setEditingFunkId(id);
    setEditingFunkValue(emp.funk || '');
  };

  const saveEditingFunk = (id) => {
    const next = employees.map(e => e.id === id ? { ...e, funk: editingFunkValue } : e);
    setEmployees(next);
    setEditingFunkId(null);
    setEditingFunkValue('');
  broadcastUpdate({ areas, assignments, employees: next });
  autoSave();
  };

  const cancelEditingFunk = () => {
    setEditingFunkId(null);
    setEditingFunkValue('');
  };

  const removeEmployee = (id) => {
    const nextEmployees = employees.filter(e => e.id !== id);
    const nextAssignments = { ...assignments }; delete nextAssignments[id];
    const nextAreas = areas.map(a => ({ ...a, members: (a.members || []).filter(m => m !== id) }));
    setEmployees(nextEmployees);
    setAssignments(nextAssignments);
    setAreas(nextAreas);
  broadcastUpdate({ areas: nextAreas, assignments: nextAssignments, employees: nextEmployees });
    autoSave();
  };

  const addArea = () => {
  // kept for programmatic calls
  const label = (newAreaLabel || '').trim() || null;
  if (!label) return;
  const id = 'a' + Date.now();
  const cap = parseMax(newAreaCapacity);
  const newArea = { id, label, members: [], capacity: cap };
  const nextAreas = (areas || []).concat(newArea);
  setAreas(nextAreas);
  setNewAreaLabel('');
  setNewAreaCapacity('');
  setShowAddArea(false);
  broadcastUpdate({ areas: nextAreas, assignments, employees });
  autoSave();
  };

  const removeArea = (id) => {
    // compute the next state synchronously so we can broadcast the correct payload
    const nextAreas = (areas || []).filter(x => x.id !== id);
    const nextAssignments = { ...(assignments || {}) };
    Object.keys(nextAssignments).forEach(k => { if (nextAssignments[k] === id) nextAssignments[k] = null; });

    setAreas(nextAreas);
    setAssignments(nextAssignments);

    // broadcast the canonical updated payload
    broadcastUpdate({ areas: nextAreas, assignments: nextAssignments, employees });
  autoSave();
  };

    // Listen for realtime updates from other clients - TEMPORARILY DISABLED
    useEffect(() => {
      // Socket.IO is temporarily disabled to prevent errors
      console.log('[EinteilungContainer] Socket.IO disabled - no realtime sync');
      return () => {};
    }, [socket, clientId, lastRemoteUpdateAt]);

    // Auto-refresh from server every 3 minutes to keep the UI in sync
    useEffect(() => {
      const MS = 3 * 60 * 1000; // 3 minutes
      const id = setInterval(() => {
        // silent reload: reloadFromServer updates saveStatus when it succeeds
        try { reloadFromServer(); } catch (e) { /* ignore */ }
      }, MS);
      return () => clearInterval(id);
    }, []);

    // Save to server endpoint (POST) and broadcast server-side
    const saveToServer = async (note) => {
      try {
        const body = { areas, assignments, employees, notes: [], updatedAt: new Date().toISOString(), clientId };
        const _username = (() => { try { return localStorage.getItem('username') || ''; } catch (e) { return ''; } })();
        const res = await fetch('/api/einteilung/containers', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-user': _username },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          const json = await res.json();
          // server will broadcast, but also broadcast locally to be safe
          broadcastUpdate(body);
          // store server canonical payload locally so closing/opening retains the same settings
          try {
            const stored = json?.stored || body;
            localStorage.setItem('einteilung:containers', JSON.stringify(stored));
          } catch (e) {}
          setSaveStatus('Gespeichert (Server)');
          setTimeout(() => setSaveStatus(''), 1400);
          return json;
        }
        throw new Error('Server save failed');
      } catch (e) {
        setSaveStatus('Fehler beim Server-Save');
        setTimeout(() => setSaveStatus(''), 2000);
        return null;
      }
    };

    // debounced auto-save: persist locally and POST to server after short delay
    const saveTimerRef = useRef(null);
    const autoSave = (note = 'auto') => {
      try { persist(note); } catch (e) {}
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        saveTimerRef.current = null;
        try { await saveToServer(note); } catch (e) {}
      }, 600);
    };

    // delete confirmation timeout to avoid accidental deletes
    const deleteTimerRef = useRef(null);
    useEffect(() => {
      return () => {
        if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      };
    }, []);

    // helper: unique teams from employees
    const teams = useMemo(() => {
      try {
        const s = new Set();
        (employees || []).forEach((e) => { if (e?.team) s.add(e.team); });
        return Array.from(s).sort();
      } catch (e) { return []; }
    }, [employees]);

    const parseMax = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    };

    // Fisher-Yates shuffle
    const shuffleArray = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    };

  const autoAssign = ({ team = 'all', strategy = 'fill', globalMax = null, balance = false } = {}) => {
      // prepare copies
      const nextAreas = (areas || []).map(a => ({ ...a, members: Array.isArray(a.members) ? [...a.members] : [] }));
      const nextAssignments = { ...(assignments || {}) };

      // candidate employees: only those matching team (or all) and not already assigned
      let candidates = (employees || []).filter(e => {
        if (!e) return false;
        if (team !== 'all' && e.team !== team) return false;
        return !nextAssignments[e.id];
      }).map(e => ({ ...e }));

      // If balancing requested: sort by assignCount asc and shuffle within equal groups
      if (balance) {
        candidates.sort((a, b) => (Number(a.assignCount || 0) - Number(b.assignCount || 0)));
        // group by assignCount and shuffle each group
        const grouped = [];
        let i = 0;
        while (i < candidates.length) {
          let j = i + 1;
          while (j < candidates.length && (candidates[j].assignCount || 0) === (candidates[i].assignCount || 0)) j++;
          const group = candidates.slice(i, j);
          shuffleArray(group);
          grouped.push(...group);
          i = j;
        }
        candidates = grouped;
      } else {
        // small randomization to avoid deterministic ordering if desired
        shuffleArray(candidates);
      }

      // capacities per area (use area.capacity or globalMax or Infinity)
      // Exclude 'Pause' areas (label === 'pause' case-insensitive) or areas with area.pause === true by setting capacity 0
      const capacities = nextAreas.map(a => {
        const isPause = a.pause === true || ((a.label || '').toString().trim().toLowerCase() === 'pause');
        if (isPause) return 0;
        // accept explicit 0 capacity; only fallback to globalMax/Infinity when no numeric capacity present
        const parsed = (a.capacity !== undefined && a.capacity !== null && Number.isFinite(Number(a.capacity))) ? Number(a.capacity) : null;
        if (parsed !== null) return parsed;
        return globalMax ? globalMax : Infinity;
      });

      if (strategy === 'fill') {
        for (let i = 0; i < nextAreas.length && candidates.length > 0; i++) {
          const area = nextAreas[i];
          const cap = Number.isFinite(capacities[i]) ? capacities[i] : Infinity;
          while (area.members.length < cap && candidates.length > 0) {
            const emp = candidates.shift();
            if (!emp) break;
            area.members.push(emp.id);
            nextAssignments[emp.id] = area.id;
            // update counters on the master employees array
            const master = employees.find(x => x.id === emp.id);
            if (master) {
              master.assignCount = (master.assignCount || 0) + 1;
              master.lastAssignedAt = new Date().toISOString();
            }
          }
        }
      } else if (strategy === 'roundrobin' || strategy === 'round-robin') {
        let idx = 0;
        let areaCount = nextAreas.length;
        let loopGuard = 0;
        while (candidates.length > 0 && loopGuard < 10000) {
          const emp = candidates.shift();
          if (!emp) break;
          // find next area with space
          let placed = false;
          for (let attempt = 0; attempt < areaCount; attempt++) {
            const ai = (idx + attempt) % areaCount;
            const area = nextAreas[ai];
            const cap = Number.isFinite(capacities[ai]) ? capacities[ai] : Infinity;
            if (area.members.length < cap) {
              area.members.push(emp.id);
              nextAssignments[emp.id] = area.id;
              const master = employees.find(x => x.id === emp.id);
              if (master) {
                master.assignCount = (master.assignCount || 0) + 1;
                master.lastAssignedAt = new Date().toISOString();
              }
              idx = ai + 1;
              placed = true;
              break;
            }
          }
          // if not placed, stop (no more space anywhere)
          if (!placed) break;
          loopGuard++;
        }
      }

      // apply state
      setAreas(nextAreas);
      setAssignments(nextAssignments);
      // broadcast & save
      broadcastUpdate({ areas: nextAreas, assignments: nextAssignments, employees });
      autoSave('auto-assign');

      // feedback message
      const assignedCount = Object.keys(nextAssignments).filter(k => assignments[k] !== nextAssignments[k]).length;
      const remaining = (employees || []).filter(e => !nextAssignments[e.id] && (team === 'all' || e.team === team)).length;
      setSaveStatus(`Auto‑Zuteilung: ${assignedCount} zugewiesen, ${remaining} übrig`);
      setTimeout(() => setSaveStatus(''), 3000);
    };

  if (inline) {
    // compact widget layout for standalone window
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <div className="w-[420px] bg-slate-800 rounded-lg p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Einteilung (Widget)</h3>
            <div className="text-sm text-slate-300">{saveStatus}</div>
          </div>

          <div className="mb-3">
            <label className="text-xs text-slate-400">Bereich</label>
            <select className="w-full mt-1 p-2 bg-slate-700 rounded" value={selectedAreaId || ''} onChange={(e) => setSelectedAreaId(e.target.value)}>
              {areas.map(a => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </div>

          <div className="mb-3 max-h-56 overflow-auto border border-slate-700 rounded p-2 bg-slate-900">
            {employees.length === 0 && <div className="text-slate-400 text-sm">Keine Mitarbeiter</div>}
            {employees.map(emp => (
              <div key={emp.id} className="flex items-center justify-between py-1">
                <div>
                  <div className="font-medium text-white text-sm">{emp.name}</div>
                  <div className="text-xs text-slate-400">Funk: {emp.funk || '–'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-2 py-1 text-xs bg-blue-600 rounded" onClick={() => assignEmployeeToArea(emp.id, selectedAreaId)}>Set</button>
                  <button className="px-2 py-1 text-xs bg-slate-600 rounded" onClick={() => assignEmployeeToArea(emp.id, null)}>Unset</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-green-600 rounded" onClick={addEmployee}>Neu</button>
              <button className="px-3 py-1 bg-indigo-600 rounded" onClick={handleSaveClick}>Save</button>
            </div>
            <div>
              <button className="px-3 py-1 bg-slate-600 rounded" onClick={() => window.close()}>Schließen</button>
            </div>
            {showAutoAssign && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-white text-black p-4 rounded shadow-lg w-[420px]">
                  <h3 className="font-semibold mb-2">Auto‑Zuteilung</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <label className="text-xs text-gray-600">Team</label>
                      <select className="w-full p-2 bg-gray-100 rounded mt-1" value={autoTeamFilter} onChange={(e) => setAutoTeamFilter(e.target.value)}>
                        <option value="all">Alle Teams</option>
                        {teams.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Strategie</label>
                      <select className="w-full p-2 bg-gray-100 rounded mt-1" value={autoStrategy} onChange={(e) => setAutoStrategy(e.target.value)}>
                        <option value="fill">Fill (nacheinander auffüllen)</option>
                        <option value="roundrobin">Round‑Robin (gleichmäßig)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Max pro Bereich (optional)</label>
                      <input className="w-full p-2 bg-gray-100 rounded mt-1" placeholder="Leer = Kapazität pro Bereich verwenden" value={autoGlobalMax} onChange={(e) => setAutoGlobalMax(e.target.value)} />
                    </div>
                    {user?.isAdmin ? (
                      <div>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={autoBalance} onChange={(e) => setAutoBalance(!!e.target.checked)} />
                          <span>Balanciert zuweisen (fairness)</span>
                        </label>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button className="px-3 py-1 bg-gray-300 rounded" onClick={() => setShowAutoAssign(false)}>Abbrechen</button>
                    <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={() => { setShowAutoAssign(false); autoAssign({ team: autoTeamFilter, strategy: autoStrategy, globalMax: parseMax(autoGlobalMax), balance: autoBalance }); }}>Anwenden</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {showAutoAssign && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white text-black p-4 rounded shadow-lg w-[520px]">
              <h3 className="font-semibold mb-2">Auto‑Zuteilung</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <label className="text-xs text-gray-600">Team</label>
                  <select className="w-full p-2 bg-gray-100 rounded mt-1" value={autoTeamFilter} onChange={(e) => setAutoTeamFilter(e.target.value)}>
                    <option value="all">Alle Teams</option>
                    {teams.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Strategie</label>
                  <select className="w-full p-2 bg-gray-100 rounded mt-1" value={autoStrategy} onChange={(e) => setAutoStrategy(e.target.value)}>
                    <option value="fill">Fill (nacheinander auffüllen)</option>
                    <option value="roundrobin">Round‑Robin (gleichmäßig)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Max pro Bereich (optional)</label>
                  <input className="w-full p-2 bg-gray-100 rounded mt-1" placeholder="Leer = Kapazität pro Bereich verwenden" value={autoGlobalMax} onChange={(e) => setAutoGlobalMax(e.target.value)} />
                </div>
                {user?.isAdmin ? (
                  <div className="mt-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={autoBalance} onChange={(e) => setAutoBalance(!!e.target.checked)} />
                      <span>Balanciert zuweisen (fairness)</span>
                    </label>
                  </div>
                ) : null}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button className="px-3 py-1 bg-gray-300 rounded" onClick={() => setShowAutoAssign(false)}>Abbrechen</button>
                <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={() => { setShowAutoAssign(false); autoAssign({ team: autoTeamFilter, strategy: autoStrategy, globalMax: parseMax(autoGlobalMax), balance: autoBalance }); }}>Anwenden</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-900 text-white">
      <div className="max-w-[1200px] mx-auto py-8 px-4">
        <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4 relative">
            {saveStatus ? (
              <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 text-sm text-slate-300 pointer-events-none">{saveStatus}</div>
            ) : null}
            <div>
              <h2 className="text-2xl font-bold">Einteilung Anlagenbetreuer</h2>
                {lastServerReload && <div className="text-sm text-slate-300">Letzte Server-Aktualisierung: {new Date(lastServerReload).toLocaleString()}</div>}
            </div>
            <div className="flex items-center gap-2">
              {areas.length === 0 && (
                <div className="flex items-center gap-2 mr-2">
                  <button className={`px-2 py-1 rounded text-sm ${canEdit ? 'bg-yellow-600' : 'bg-gray-600 opacity-60 cursor-not-allowed'}`} onClick={canEdit ? loadDefaultAreas : undefined} disabled={!canEdit}>Bereiche laden</button>
                  <button className={`px-2 py-1 rounded text-sm ${canEdit ? 'bg-slate-600' : 'bg-gray-600 opacity-60 cursor-not-allowed'}`} onClick={canEdit ? reloadFromServer : undefined} disabled={!canEdit}>Vom Server</button>
                </div>
              )}
              {inline ? (
                <button className="px-3 py-1 bg-gray-700 text-white rounded" onClick={() => { try { if (typeof onClose === 'function') onClose(); } catch (e) {} }}>Zurück</button>
              ) : null}

              {/* Add employee inline */}
              {!showAddEmployee ? (
                <button className={`px-3 py-1 rounded ${canEdit ? 'bg-green-600 text-white' : 'bg-gray-600 text-slate-300 opacity-60 cursor-not-allowed'}`} onClick={canEdit ? () => setShowAddEmployee(true) : undefined} disabled={!canEdit}>Neu</button>
              ) : (
                <div className="flex items-center gap-2">
                  <input className="px-2 py-1 rounded bg-slate-700 text-white" placeholder="Name" value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)} />
                  <input className="px-2 py-1 rounded bg-slate-700 text-white w-32" placeholder="Funk" value={newEmployeeFunk} onChange={(e) => setNewEmployeeFunk(e.target.value)} />
                  <button className={`px-2 py-1 rounded ${canEdit ? 'bg-green-600 text-white' : 'bg-gray-600 text-slate-300 opacity-60 cursor-not-allowed'}`} onClick={canEdit ? addEmployee : undefined} disabled={!canEdit}>OK</button>
                  <button className="px-2 py-1 bg-gray-600 rounded" onClick={() => { setShowAddEmployee(false); setNewEmployeeName(''); setNewEmployeeFunk(''); }}>Abbrechen</button>
                </div>
              )}

              <button className={`px-3 py-1 rounded ${canEdit ? 'bg-indigo-600 text-white' : 'bg-gray-600 text-slate-300 opacity-60 cursor-not-allowed'}`} onClick={canEdit ? handleSaveClick : undefined} disabled={!canEdit}>Save</button>
              <button className={`px-3 py-1 rounded ${canEdit ? 'bg-red-600 text-white' : 'bg-gray-600 text-slate-300 opacity-60 cursor-not-allowed'}`} onClick={canEdit ? unassignAll : undefined} disabled={!canEdit}>Alle auflösen</button>

              {/* Add area inline */}
              {!showAddArea ? (
                <button className={`px-3 py-1 rounded ${canEdit ? 'bg-slate-600 text-white' : 'bg-gray-600 text-slate-300 opacity-60 cursor-not-allowed'}`} onClick={canEdit ? () => setShowAddArea(true) : undefined} disabled={!canEdit}>Area+</button>
              ) : (
                <div className="flex items-center gap-2">
                  <input className="px-2 py-1 rounded bg-slate-700 text-white" placeholder="Area-Name" value={newAreaLabel} onChange={(e) => setNewAreaLabel(e.target.value)} />
                  {user?.isAdmin ? (
                    <input className="px-2 py-1 rounded bg-slate-700 text-white w-24" placeholder="Kapazität (opt.)" value={newAreaCapacity} onChange={(e) => setNewAreaCapacity(e.target.value)} />
                  ) : null}
                  <button className={`px-2 py-1 rounded ${canEdit ? 'bg-slate-600 text-white' : 'bg-gray-600 text-slate-300 opacity-60 cursor-not-allowed'}`} onClick={canEdit ? addArea : undefined} disabled={!canEdit}>OK</button>
                  <button className="px-2 py-1 bg-gray-600 rounded" onClick={() => { setShowAddArea(false); setNewAreaLabel(''); }}>Abbrechen</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6 mt-6">
          <div className="w-full md:w-60 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Mitarbeiter</h3>
                <div className="flex items-center gap-2">
                  <button className={`px-2 py-1 text-xs rounded ${canEdit ? 'bg-indigo-600 text-white' : 'bg-gray-600 text-slate-300 opacity-60 cursor-not-allowed'}`} onClick={canEdit ? () => { autoAssign({ team: 'all', strategy: 'fill', globalMax: parseMax(autoGlobalMax) }); } : undefined} disabled={!canEdit}>Auto‑Zuteilung</button>
                </div>
              </div>
            <div onDragOver={onDragOver} onDrop={onDropToList} className="border border-slate-700 p-2 rounded min-h-[180px] bg-gradient-to-b from-slate-900 to-slate-800">
              {employees.length === 0 && <div className="text-slate-400 text-sm">Keine Mitarbeiter. Neu erstellen.</div>}
              {employees.map((emp) => {
                const assigned = !!assignments[emp.id];
                return (
                  <div key={emp.id} draggable className={`p-1 mb-1 rounded text-sm flex items-center justify-between transition-all ${assigned ? 'bg-slate-700 opacity-85' : 'bg-slate-800 hover:shadow-sm cursor-grab'}`} onDragStart={(e) => onDragStart(e, emp.id)}>
                    <div>
                      <div className="font-medium text-white text-sm">{emp.name}</div>

                      {editingFunkId === emp.id ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            className="text-sm p-1 rounded bg-slate-900 border border-slate-600"
                            value={editingFunkValue}
                            onChange={(e) => setEditingFunkValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button className="text-xs bg-green-600 px-2 py-0.5 rounded" onClick={(ev) => { ev.stopPropagation(); saveEditingFunk(emp.id); }}>Save</button>
                          <button className="text-xs bg-slate-700 px-2 py-0.5 rounded" onClick={(ev) => { ev.stopPropagation(); cancelEditingFunk(); }}>Cancel</button>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-300">Funk: {emp.funk || <span className="text-slate-500">–</span>}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs">
                      <button className="text-xs text-slate-300" onClick={(ev) => { ev.stopPropagation(); editEmployeeFunk(emp.id); }}>Edit</button>
                      {pendingDeleteEmployeeId === emp.id ? (
                        <div className="flex items-center gap-1">
                          <button className="text-xs bg-red-600 px-2 py-0.5 rounded text-white" onClick={(ev) => { ev.stopPropagation(); if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current); removeEmployee(emp.id); }}>OK</button>
                          <button className="text-xs bg-gray-600 px-2 py-0.5 rounded" onClick={(ev) => { ev.stopPropagation(); setPendingDeleteEmployeeId(null); if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current); }}>Abbr.</button>
                        </div>
                      ) : (
                        <button className="text-xs text-red-400" onClick={(ev) => { ev.stopPropagation(); setPendingDeleteEmployeeId(emp.id); if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current); deleteTimerRef.current = setTimeout(() => setPendingDeleteEmployeeId(null), 5000); }}>Entf.</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', alignItems: 'start' }}>
              {areas.map(area => {
                const isPause = area.pause === true || ((area.label || '').toString().trim().toLowerCase() === 'pause');
                return (
                <div key={area.id}
                  draggable={false}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDropToArea(e, area.id)}
                  className={`border border-dashed border-slate-700 p-3 rounded bg-gradient-to-b from-slate-800 to-slate-700 text-white shadow-sm flex flex-col h-full min-h-[160px] ${area.fixed ? 'opacity-80 pointer-events-auto' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-sm md:text-base">{area.label}</strong>
                      {area.capacity ? (
                        <span className="text-xs bg-black/20 px-2 py-0.5 rounded text-slate-200">Cap: {area.capacity}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Reorder controls removed: areas are fixed in position per user preference */}
                      {user?.isAdmin ? (
                        <AreaCapacityEditor area={area} setAreas={setAreas} areas={areas} broadcastUpdate={broadcastUpdate} autoSave={autoSave} employees={employees} assignments={assignments} />
                      ) : null}
                      <button onClick={canEdit ? () => { if (!window.confirm(`Bereich \"${area.label}\" löschen?`)) return; removeArea(area.id); } : undefined} disabled={!canEdit} className={`${canEdit ? 'text-red-300' : 'text-slate-400'} text-xs`}>✕</button>
                    </div>
                  </div>
                  <div className="mt-2 flex-1 overflow-auto">
                    {(area.members || []).map(eid => {
                      const emp = employees.find(e => e.id === eid) || { id: eid, name: eid, funk: '' };
                      return (
                        <div key={eid} draggable onDragStart={(e) => onDragStart(e, eid)} className="p-2 mb-2 rounded border border-slate-700 bg-slate-800 flex items-center justify-between shadow-sm text-sm">
                          <div>
                            <div className="font-medium text-white text-sm">{emp.name}</div>
                            <div className="text-xs text-slate-300">Funk: {emp.funk || <span className="text-slate-500">–</span>}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1 text-xs">
                            <button className={`text-xs ${canEdit ? 'text-slate-300' : 'text-slate-500 opacity-60 cursor-not-allowed'}`} onClick={canEdit ? (ev) => { ev.stopPropagation(); editEmployeeFunk(emp.id); } : undefined} disabled={!canEdit}>Edit</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Small admin-only inline editor for area.capacity
function AreaCapacityEditor({ area, setAreas, areas, broadcastUpdate, autoSave, employees, assignments }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(area.capacity || '');

  const save = () => {
    const cap = Number.isFinite(Number(val)) && Number(val) > 0 ? Math.floor(Number(val)) : null;
    const nextAreas = (areas || []).map(a => a.id === area.id ? { ...a, capacity: cap } : a);
    setAreas(nextAreas);
    broadcastUpdate({ areas: nextAreas, assignments, employees });
    autoSave('capacity-change');
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <>
          <input className="w-20 px-2 py-0.5 rounded text-xs text-black" value={val ?? ''} onChange={(e) => setVal(e.target.value)} />
          <button className="text-xs bg-green-600 px-2 py-0.5 rounded text-white" onClick={save}>OK</button>
          <button className="text-xs bg-gray-600 px-2 py-0.5 rounded" onClick={() => { setEditing(false); setVal(area.capacity || ''); }}>Abbr.</button>
        </>
      ) : (
        <button className="text-xs bg-white/5 px-2 py-0.5 rounded" onClick={() => setEditing(true)}>Cap</button>
      )}
    </div>
  );
}
