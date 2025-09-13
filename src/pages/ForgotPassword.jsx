import { useState } from "react";
import { Users } from "../api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await Users.requestReset(email.trim());
      if (res?.devToken) {
        setMsg(
          `Token (Dev): ${res.devToken} — benutze ihn auf der Reset-Seite oder kopiere ihn.`
        );
      } else {
        setMsg('Wenn ein Konto existiert, wurde eine E-Mail gesendet.');
      }
    } catch (e) {
      setMsg(e?.message || 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <form onSubmit={handleSubmit} className="w-[min(420px,90vw)] bg-gray-800 p-6 rounded-2xl shadow-2xl space-y-4">
        <h1 className="text-xl font-bold text-blue-400">Passwort vergessen</h1>
        <p className="text-sm text-gray-300">Gib die E-Mail-Adresse ein, mit der dein Konto registriert ist.</p>

        {msg && <div className="text-sm bg-white/5 p-2 rounded">{msg}</div>}

        <div>
          <label className="text-sm text-gray-300">E-Mail</label>
          <input
            type="email"
            className="mt-1 w-full p-2 rounded bg-gray-700 focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <button type="submit" disabled={loading} className={`w-full py-2 rounded bg-blue-600 hover:bg-blue-500 transition ${loading ? "opacity-70 cursor-not-allowed" : ""}`}>
          {loading ? 'Sende…' : 'Sende Reset-Link'}
        </button>
      </form>
    </div>
  );
}
