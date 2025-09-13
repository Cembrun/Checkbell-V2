// src/pages/Login.jsx
import { useState } from "react";
import { Auth } from "../api";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const data = await Auth.login(username.trim(), password);
      onLogin(data?.username || username.trim());
    } catch (e2) {
      setErr(e2?.message || "Login fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-[min(420px,90vw)] bg-gray-800 p-6 rounded-2xl shadow-2xl space-y-4"
      >
        <h1 className="text-xl font-bold text-blue-400">Anmelden</h1>

        {err && (
          <div className="text-sm bg-red-600/20 border border-red-600/40 text-red-300 px-3 py-2 rounded">
            {err}
          </div>
        )}

        <div>
          <label className="text-sm text-gray-300">Benutzername</label>
          <input
            className="mt-1 w-full p-2 rounded bg-gray-700 focus:outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label className="text-sm text-gray-300">Passwort</label>
          <input
            type="password"
            className="mt-1 w-full p-2 rounded bg-gray-700 focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 rounded bg-blue-600 hover:bg-blue-500 transition ${
            loading ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          {loading ? "Anmelden…" : "Anmelden"}
        </button>

  {/* Kein 'Passwort vergessen' Link */}
      </form>
    </div>
  );
}
