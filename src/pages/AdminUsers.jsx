// src/pages/AdminUsers.jsx
import { useEffect, useState } from "react";
import { api } from "../api";
import {
  FiX,
  FiRefreshCw,
  FiUserPlus,
  FiShield,
  FiKey,
  FiTrash2,
} from "react-icons/fi";

export default function AdminUsers({ onBack }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Online-Set (grün/grau)
  const [online, setOnline] = useState(new Set());

  // Create form
  const [username, setUsername] = useState("");
  const [tempPw, setTempPw] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [mustChange, setMustChange] = useState(true);

  function genPw() {
    const s = Math.random().toString(36).slice(2, 10);
    const t = Math.random().toString(36).slice(2, 6).toUpperCase();
    setTempPw(`${s}${t}!`);
  }

  async function loadUsers() {
    setLoading(true);
    setErr("");
    try {
      const data = await api("/api/users");
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }

  async function loadOnline() {
    try {
      const res = await api("/api/users/online");
      setOnline(new Set(res?.online || []));
    } catch {
      // Ignorieren (z. B. kein Admin)
      setOnline(new Set());
    }
  }

  async function load() {
    await Promise.all([loadUsers(), loadOnline()]);
  }

  useEffect(() => {
    load();
    const iv = setInterval(loadOnline, 10_000);
    const onFocus = () => loadOnline();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  async function createUser(e) {
    e.preventDefault();
    if (!username || !tempPw) return;
    try {
      await api("/api/users", {
        method: "POST",
        json: {
          username,
          password: tempPw,
          isAdmin,
          mustChangePassword: !!mustChange,
        },
      });
      setUsername("");
      setTempPw("");
      setIsAdmin(false);
      setMustChange(true);
      await load();
      alert("Benutzer angelegt.");
    } catch (e) {
      alert(e?.message || "Fehler beim Anlegen");
    }
  }

  async function toggleAdmin(u) {
    try {
      const next = !u.isAdmin;
      await api(`/api/users/${encodeURIComponent(u.username)}/admin`, {
        method: "PATCH",
        json: { isAdmin: next },
      });
      setList((prev) =>
        prev.map((x) => (x.username === u.username ? { ...x, isAdmin: next } : x))
      );
    } catch (e) {
      alert(e?.message || "Konnte Admin-Status nicht ändern");
    }
  }

  async function toggleMustChange(u) {
    try {
      const next = !u.mustChangePassword;
      await api(`/api/users/${encodeURIComponent(u.username)}/must-change`, {
        method: "PATCH",
        json: { mustChange: next },
      });
      setList((prev) =>
        prev.map((x) =>
          x.username === u.username ? { ...x, mustChangePassword: next } : x
        )
      );
    } catch (e) {
      alert(e?.message || "Konnte Flag nicht ändern");
    }
  }

  async function resetPassword(u) {
    const newPw = prompt(`Neues temporäres Passwort für "${u.username}":`, "");
    if (!newPw) return;
    const force = confirm(
      "Soll der Benutzer beim nächsten Login das Passwort ändern müssen?"
    );
    try {
      await api(`/api/users/${encodeURIComponent(u.username)}/password`, {
        method: "PATCH",
        json: { newPassword: newPw, mustChangeNext: !!force },
      });
      if (force && !u.mustChangePassword) {
        setList((prev) =>
          prev.map((x) =>
            x.username === u.username ? { ...x, mustChangePassword: true } : x
          )
        );
      }
      alert("Passwort zurückgesetzt.");
    } catch (e) {
      alert(e?.message || "Konnte Passwort nicht zurücksetzen");
    }
  }

  async function removeUser(u) {
    if (!confirm(`Benutzer "${u.username}" wirklich löschen?`)) return;
    try {
      await api(`/api/users/${encodeURIComponent(u.username)}`, {
        method: "DELETE",
      });
      setList((prev) => prev.filter((x) => x.username !== u.username));
    } catch (e) {
      alert(e?.message || "Konnte Benutzer nicht löschen");
    }
  }

  return (
    <div className="min-h-[70vh]">
      {/* Topbar */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Benutzerverwaltung</div>
          <div className="text-xs opacity-90">
            Benutzer anlegen, Rollen verwalten, Passwörter zurücksetzen
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
            title="Aktualisieren"
          >
            <FiRefreshCw />
            Aktualisieren
          </button>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-gray-900 hover:bg-gray-100"
          >
            <FiX />
            Schließen
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Create card */}
        <form onSubmit={createUser} className="bg-white border rounded-2xl shadow-sm p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-9 w-9 rounded-lg bg-indigo-50 text-indigo-700 grid place-items-center">
              <FiUserPlus />
            </div>
            <h3 className="text-base md:text-lg font-semibold">
              Neuen Benutzer anlegen
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-4">
              <label className="block text-sm mb-1">Benutzername</label>
              <input
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="z. B. max.mustermann"
                required
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-sm mb-1">Temporäres Passwort</label>
              <div className="flex gap-2">
                <input
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={tempPw}
                  onChange={(e) => setTempPw(e.target.value)}
                  placeholder="mind. 8 Zeichen"
                  required
                />
                <button
                  type="button"
                  onClick={genPw}
                  className="px-3 py-2 rounded-lg border hover:bg-gray-50"
                  title="Passwort vorschlagen"
                >
                  Gen
                </button>
              </div>
            </div>

            <div className="md:col-span-2 flex items-center gap-3">
              <span className="text-sm">Admin</span>
              <Switch checked={isAdmin} onChange={setIsAdmin} icon={<FiShield />} />
            </div>

            <div className="md:col-span-2 flex items-center gap-3">
              <span className="text-sm">Erst-Login: ändern</span>
              <Switch checked={mustChange} onChange={setMustChange} icon={<FiKey />} />
            </div>
          </div>

          <div className="mt-4 text-right">
            <button
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
            >
              <FiUserPlus />
              Anlegen
            </button>
          </div>
        </form>

        {/* Error */}
        {err ? <div className="text-sm text-red-600">{err}</div> : null}

        {/* List card */}
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b text-sm text-gray-700">
            {loading ? "Lade Benutzer…" : `Benutzer: ${list.length}`}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left">
                  <Th>Benutzer</Th>
                  <Th>Rolle</Th>
                  <Th>Erst-Login</Th>
                  <Th>Angelegt</Th>
                  <Th className="text-right">Aktionen</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-gray-500">
                      Keine Benutzer vorhanden.
                    </td>
                  </tr>
                ) : (
                  list.map((u) => (
                    <tr key={u.username} className="hover:bg-gray-50/60">
                      <Td>
                        <div className="flex items-center gap-2">
                          <Dot active={online.has(u.username)} />
                          <div className="font-medium">{u.username}</div>
                        </div>
                      </Td>
                      <Td>
                        <Badge color={u.isAdmin ? "emerald" : "gray"}>
                          {u.isAdmin ? "Admin" : "Mitarbeiter"}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge color={u.mustChangePassword ? "amber" : "slate"}>
                          {u.mustChangePassword ? "muss ändern" : "frei"}
                        </Badge>
                      </Td>
                      <Td>
                        {u.createdAt
                          ? new Date(u.createdAt).toLocaleString("de-DE")
                          : "—"}
                      </Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-2">
                          <SmallButton onClick={() => toggleAdmin(u)} title="Admin umschalten">
                            <FiShield />
                            {u.isAdmin ? "entziehen" : "geben"}
                          </SmallButton>
                          <SmallButton onClick={() => toggleMustChange(u)} title="Erst-Login-Pflicht umschalten">
                            <FiKey />
                            {u.mustChangePassword ? "deaktivieren" : "aktivieren"}
                          </SmallButton>
                          <SmallButton onClick={() => resetPassword(u)} title="Passwort zurücksetzen">
                            <FiKey />
                            Reset
                          </SmallButton>
                          <SmallButton danger onClick={() => removeUser(u)} title="Benutzer löschen">
                            <FiTrash2 />
                            Löschen
                          </SmallButton>
                        </div>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- kleine UI-Helfer ---------- */
function Th({ children, className = "" }) {
  return (
    <th className={`px-4 py-3 font-semibold text-gray-700 ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = "" }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}
function Badge({ children, color = "slate" }) {
  const map = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    gray: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[color]}`}>
      {children}
    </span>
  );
}
function SmallButton({ children, onClick, title, danger = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm
        ${danger ? "bg-red-600 text-white hover:bg-red-700 border-red-600" : "bg-white hover:bg-gray-50"}`}
    >
      {children}
    </button>
  );
}
function Switch({ checked, onChange, icon }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center h-8 w-14 rounded-full transition
        ${checked ? "bg-indigo-600" : "bg-gray-300"}`}
      title="Umschalten"
    >
      <span
        className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform grid place-items-center
          ${checked ? "translate-x-6" : "translate-x-0"}`}
      >
        <span className={`text-gray-500 ${checked ? "text-indigo-600" : ""}`}>{icon || null}</span>
      </span>
    </button>
  );
}
function Dot({ active }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        active ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,.25)]" : "bg-gray-300"
      }`}
      title={active ? "online" : "offline"}
    />
  );
}
