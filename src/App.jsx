// src/App.jsx
import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
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
  if (user) {
    return (
      <div className="relative min-h-screen">
        {errMe && (
          <div className="fixed top-3 left-3 z-40 px-3 py-1.5 rounded bg-red-600 text-white text-sm shadow">
            {errMe}
          </div>
        )}
        {infoMsg && (
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded bg-green-600 text-white text-base shadow font-bold">
            {infoMsg}
          </div>
        )}

        {/* feste Top-Leiste: Archiv, Statistik, eingeloggter User, Admin */}
        <div className="fixed top-3 right-3 z-40 flex items-center gap-2">
          <button
            onClick={() => setShowArchive(true)}
            className="px-3 py-1 rounded-lg border bg-white hover:bg-gray-50 shadow-sm mr-2"
            title="Archiv: erledigte Einträge"
          >
            Archiv
          </button>
          <button
            onClick={() => navigate("/statistik")}
            className="px-3 py-1 rounded-lg border bg-white hover:bg-gray-50 shadow-sm mr-2"
            title="Statistik & KPIs"
          >
            Statistik
          </button>
          <span className="px-2 py-1 rounded-lg border bg-white/80 shadow-sm text-sm">
            eingeloggt als <b>{me?.username || user.username}</b>
          </span>
          {me?.isAdmin && (
            <button
              onClick={() => setShowAdmin(true)}
              className="px-3 py-1 rounded-lg border bg-white hover:bg-gray-50 shadow-sm"
              title="Benutzerverwaltung"
              disabled={loadingMe}
            >
              Admin
            </button>
          )}
        </div>

        <Routes>
          <Route path="/" element={<Dashboard user={me || user} onLogout={handleLogout} />} />
          <Route path="/statistik" element={<Statistik />} />
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

        {showArchive && <Archive onClose={() => setShowArchive(false)} />}
      </div>
    );
  }

  // Kein Register-Flow mehr – nur Login anzeigen
  return <Login onLogin={handleLogin} />;
}
