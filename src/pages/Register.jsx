import { useState } from "react";

export default function Register({ onBack }) {
  const [formData, setFormData] = useState({ username: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (formData.password !== formData.confirm) {
      setError("Passwörter stimmen nicht überein");
      return;
    }

    try {
      const res = await fetch("http://localhost:4000/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: formData.username, password: formData.password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Registrierung fehlgeschlagen");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-violet-100 px-4">
      <div className="bg-white shadow-xl rounded-xl p-8 max-w-sm w-full">
        <h2 className="text-2xl font-bold text-center text-blue-800 mb-6">Registrierung</h2>

        {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
        {success && <div className="text-green-600 text-sm mb-4">Registrierung erfolgreich!</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="username"
            type="text"
            placeholder="Benutzername"
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg"
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Passwort"
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg"
            required
          />
          <input
            name="confirm"
            type="password"
            placeholder="Passwort bestätigen"
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg"
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
          >
            Registrieren
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <button onClick={onBack} className="text-blue-600 hover:underline">
            Zurück zum Login
          </button>
        </div>
      </div>
    </div>
  );
}
