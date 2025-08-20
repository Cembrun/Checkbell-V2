import React from "react";

// Beispielhafte KPIs, bitte anpassen/erweitern
const KPIs = [
  { label: "Offene Tasks", value: 0 },
  { label: "Erledigte Tasks", value: 0 },
  { label: "Durchschnittliche Bearbeitungszeit", value: "-" },
  { label: "Anzahl Meldungen", value: 0 },
  { label: "Erstellte Nutzer", value: 0 },
  // ...weitere KPIs
];

import { useNavigate } from "react-router-dom";

export default function Statistik() {
  const navigate = useNavigate();
  return (
    <div className="p-8 max-w-2xl mx-auto bg-gray-900 min-h-screen text-white">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Statistik & KPIs</h1>
        <button
          onClick={() => navigate("/")}
          className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 text-yellow-400 font-semibold shadow border border-gray-700"
        >
          Zurück zum Dashboard
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {KPIs.map((kpi, idx) => (
          <div key={idx} className="bg-gray-800 rounded p-6 shadow text-center border border-gray-700">
            <div className="text-lg text-gray-400 mb-2">{kpi.label}</div>
            <div className="text-3xl font-bold text-yellow-400">{kpi.value}</div>
          </div>
        ))}
      </div>
      {/* Hier können weitere Diagramme, Tabellen oder Auswertungen ergänzt werden */}
    </div>
  );
}
