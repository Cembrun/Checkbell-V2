// src/components/StatusBadge.jsx
import { formatDateTimeDe } from "../utils/datetime";

export default function StatusBadge({ item, compact = false, className = "" }) {
  const isDone = !!item?.completed;
  const doneTime = item?.completedAt ? formatDateTimeDe(item.completedAt) : null;
  const createdTime = item?.createdAt ? formatDateTimeDe(item.createdAt) : (item?.erstelltAm || "—");
  const who = item?.erledigtVon || "unbekannt";

  const base = compact
    ? "text-[11px] px-2 py-0.5 rounded inline-flex items-center gap-1"
    : "text-xs px-2.5 py-1 rounded inline-flex items-center gap-1";

  if (isDone) {
    return (
      <span className={`${base} bg-green-900/40 text-green-300 border border-green-700/50 ${className}`}>
        <span>✅</span>
        <span className="font-semibold">erledigt</span>
        <span className="opacity-80">•</span>
        <span>{doneTime || "Zeit unbekannt"}</span>
        <span className="opacity-80">•</span>
        <span>von <b>{who}</b></span>
      </span>
    );
  }

  return (
    <span className={`${base} bg-gray-700/60 text-gray-200 border border-gray-600/60 ${className}`}>
      <span>⏳</span>
      <span className="font-semibold">offen</span>
      <span className="opacity-80">•</span>
      <span>erstellt {createdTime}</span>
    </span>
  );
}
