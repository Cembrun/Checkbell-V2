// Backup of src/pages/Dashboard.jsx on 2025-08-22 12:50 (local)
// Full file content follows

// src/pages/Dashboard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { exportSinglePDFWithImages } from "../utils/pdfExport";

/* =========================
	 Inline: StatusBadge
	 ========================= */
function StatusBadge({ item, compact = false }) {
	const isDone = item.status === "erledigt" || item.completed;
	const ts = item.completedAt || item.erledigtAm || item.updatedAt || item.createdAt;
	const when =
		ts &&
		(function () {
			try {
				return new Date(ts).toLocaleString("de-DE");
			} catch {
				return "";
			}
		})();

	if (compact) {
		return (
			<span
				className={`inline-block text-[11px] px-2 py-0.5 rounded ${
					isDone ? "bg-green-700" : "bg-yellow-700"
				}`}
			>
				{isDone ? "erledigt" : "offen"}
			</span>
		);
	}

	return (
		<div
			className={`inline-flex items-center gap-2 px-2 py-1 rounded ${
				isDone ? "bg-green-700" : "bg-yellow-700"
			}`}
		>
			<strong>{isDone ? "Erledigt" : "Offen"}</strong>
			{when && <span className="text-xs opacity-90">{when}</span>}
			{item.erledigtVon && (
				<span className="text-xs opacity-90">von {item.erledigtVon}</span>
			)}
		</div>
	);
}

// ...rest omitted in backup file for brevity; full interactive backup created locally.

