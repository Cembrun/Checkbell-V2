import { useState } from "react";
import { Users } from "../api";
import { useSearchParams, useNavigate } from "react-router-dom";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromQuery = searchParams.get("token") || "";

  const [token, setToken] = useState(tokenFromQuery);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!token) return setErr("Token fehlt");
    if (!pw || pw.length < 4) return setErr("Passwort mindestens 4 Zeichen");
    if (pw !== pw2) return setErr("Passwörter stimmen nicht überein");
    setLoading(true);
    try {
      await Users.resetWithToken(token, pw);
      setOk("Passwort erfolgreich gesetzt. Du kannst dich jetzt anmelden.");
      setTimeout(() => navigate('/'), 1200);
    } catch (e) {
      setErr(e?.message || 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <form onSubmit={handleSubmit} className="w-[min(420px,90vw)] bg-gray-800 p-6 rounded-2xl shadow-2xl space-y-4">
        <h1 className="text-xl font-bold text-blue-400">Passwort zurücksetzen</h1>

        {err && <div className="text-sm bg-red-600/20 border border-red-600/40 text-red-300 px-3 py-2 rounded">{err}</div>}
        {ok && <div className="text-sm bg-green-600/20 border border-green-600/40 text-green-300 px-3 py-2 rounded">{ok}</div>}

        <div>
          <label className="text-sm text-gray-300">Token</label>
          <input className="mt-1 w-full p-2 rounded bg-gray-700 focus:outline-none" value={token} onChange={(e) => setToken(e.target.value)} />
        </div>

        <div>
          <label className="text-sm text-gray-300">Neues Passwort</label>
          <input type="password" className="mt-1 w-full p-2 rounded bg-gray-700 focus:outline-none" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </div>

        <div>
          <label className="text-sm text-gray-300">Passwort wiederholen</label>
          <input type="password" className="mt-1 w-full p-2 rounded bg-gray-700 focus:outline-none" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
        </div>

        <button type="submit" disabled={loading} className={`w-full py-2 rounded bg-blue-600 hover:bg-blue-500 transition ${loading ? "opacity-70 cursor-not-allowed" : ""}`}>
          {loading ? 'Setze…' : 'Passwort setzen'}
        </button>
      </form>
    </div>
  );
}
