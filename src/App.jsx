// src/App.jsx
import { useEffect, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { api, apiPost } from "./api";
import AdminUsers from "./pages/AdminUsers.jsx";
import Archive from "./pages/Archive.jsx";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Statistik from "./pages/Statistik";

export default function App() {
  const [user, setUser] = useState(null);      // { username }
  const [me, setMe] = useState(null);          // { username, isAdmin, createdAt, mustChangePassword }
  const [showAdmin, setShowAdmin] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [loadingMe, setLoadingMe] = useState(false);
  const [errMe, setErrMe] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  // Beim Start: vorhandenen Login aus localStorage laden (nur UI-Fallback)
  useEffect(() => {
    const username = localStorage.getItem("username");
    if (username) setUser({ username });
  }, []);

  // Wenn eingeloggt: /api/users/me laden (Sessions, keine Header nötig)
  useEffect(() => {
    if (!user?.username) {
      setMe(null);
      return;
    }
    (async () => {
      setLoadingMe(true);
      setErrMe("");
      try {
        const data = await api("/api/users/me");
        setMe(data);
        if (data?.username) localStorage.setItem("username", data.username);
      } catch (e) {
        setMe({ username: user.username, isAdmin: false });
        setErrMe(e?.message || "Konnte Rechte nicht laden");
      } finally {
        setLoadingMe(false);
      }
    })();
  }, [user?.username]);

  function handleLogin(u) {
  const username = typeof u === "string" ? u : u?.username;
  if (!username) return;
  localStorage.setItem("username", username);
  setUser({ username });
  setInfoMsg("Login erfolgreich!");
  setTimeout(() => setInfoMsg(""), 2000);
  }

  async function handleLogout() {
  try { await apiPost("/api/logout"); } catch {}
  localStorage.removeItem("username");
  setUser(null);
  setMe(null);
  setShowAdmin(false);
  setShowArchive(false);
  setInfoMsg("Logout erfolgreich!");
  setTimeout(() => setInfoMsg(""), 2000);
  }

  const navigate = useNavigate();
  const location = useLocation();

  if (user) {
    return (
      <div className="relative min-h-screen">
        {errMe && (
          <div className="mb-2 px-3 py-1.5 rounded bg-red-600 text-white text-sm shadow">
            {errMe}
          </div>
        )}
        {infoMsg && (
          <div className="mb-2 px-4 py-2 rounded bg-green-600 text-white text-base shadow font-bold text-center">
            {infoMsg}
          </div>
        )}

  {/* Header: brand left, actions right */}
  <header className="relative w-full bg-blue-600 text-white shadow-sm">
  <div className="w-full mx-auto flex items-center justify-between px-4 sm:px-6 py-3 pl-12">
      <div className="flex items-center gap-3">
        {/* simple brand: circle + text - clickable to return to dashboard */}
        <div
          className="absolute left-5 sm:left-6 top-1/2 transform -translate-y-1/2 flex items-center gap-3 cursor-pointer"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/'); }}
          title="Zurück zum Dashboard"
        >
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" aria-hidden>
            {/* stylized bell with check mark */}
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M12 3C10.343 3 9 4.343 9 6v1.07C6.163 8.213 4 11.012 4 14v2l-1 1v1h18v-1l-1-1v-2c0-2.988-2.163-5.787-5-5.93V6c0-1.657-1.343-3-3-3z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" fillOpacity="0.06" />
              <path d="M9.5 17c.5.9 1.4 1.5 2.5 1.5s2-.6 2.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9.5 11.5l1.5 1.5 3-3" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="font-semibold text-lg leading-none">CheckBell</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowArchive(true)}
          className="hidden sm:inline-block px-3 py-1 rounded-md bg-white/10 hover:bg-white/20"
          title="Archiv: erledigte Einträge"
        >
          Archiv
        </button>
        <button
          onClick={() => navigate("/statistik")}
          className="hidden sm:inline-block px-3 py-1 rounded-md bg-white/10 hover:bg-white/20"
          title="Statistik & KPIs"
        >
          Statistik
        </button>
        <span className="px-2 py-1 rounded-md bg-white/10 text-sm">
          eingeloggt als <b className="ml-1">{me?.username || user.username}</b>
        </span>
  {(me?.role === 'admin' || me?.isAdmin) && (
          <button
            onClick={() => setShowAdmin(true)}
            className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20"
            title="Benutzerverwaltung"
            disabled={loadingMe}
          >
            Admin
          </button>
        )}
      </div>
    </div>
  </header>

        <Routes>
          <Route path="/" element={<Dashboard user={me || user} onLogout={handleLogout} />} />
          <Route path="/statistik" element={<Statistik />} />
          {/* Einteilung feature fully removed */}
        </Routes>

        {showAdmin && me?.isAdmin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowAdmin(false)}
            />
            <div className="relative z-10 w-[min(1200px,95vw)] max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-auto">
              <AdminUsers user={me || user} onBack={() => setShowAdmin(false)} />
            </div>
          </div>
        )}

  {showArchive && <Archive onClose={() => setShowArchive(false)} user={me} />}
      </div>
    );
  }

  // Kein Register-Flow mehr – nur Login anzeigen
  return <Login onLogin={handleLogin} />;
}
