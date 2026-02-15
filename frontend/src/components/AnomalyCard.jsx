// src/components/AnomalyCard.jsx
import React from "react";

/**
 * AnomalyCard — prettier visuals, severity strip, icons, and subtle hover.
 *
 * Props:
 *  - anomaly: object
 *  - onView(anomaly)
 *  - onAcknowledge(anomaly)
 *  - onResolve(anomaly)
 *
 * NOTE: Styling only. No logic changed.
 */

const SEV_COLORS = {
  critical: { bg: "bg-rose-50", strip: "bg-rose-400/60", text: "text-rose-700", accent: "text-rose-600" },
  warning: { bg: "bg-amber-50", strip: "bg-amber-400/60", text: "text-amber-700", accent: "text-amber-600" },
  info: { bg: "bg-sky-50", strip: "bg-sky-400/60", text: "text-sky-700", accent: "text-sky-600" },
  default: { bg: "bg-gray-50", strip: "bg-gray-200", text: "text-gray-700", accent: "text-gray-600" },
};

export default function AnomalyCard({ anomaly, onView = () => {}, onAcknowledge = () => {}, onResolve = () => {} }) {
  const sevKey = (anomaly.severity || "default").toLowerCase();
  const col = SEV_COLORS[sevKey] || SEV_COLORS.default;

  const details = anomaly.details || {};
  const title = anomaly.name || anomaly.rule || "Anomaly";
  const short = (details.reason || details.summary || String(details) || "").toString().slice(0, 140);

  return (
    <div
      role="article"
      aria-labelledby={`anomaly-${anomaly.id}`}
      className={`group relative flex rounded-xl overflow-hidden shadow-sm border ${col.bg} transition hover:shadow-lg`}
      style={{ borderColor: "rgba(0,0,0,0.04)" }}
    >
      {/* severity strip */}
      <div className={`${col.strip} w-1`} aria-hidden />

      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={`px-2 py-0.5 rounded text-xs font-semibold ${col.accent} bg-white/20`}>
                  {(anomaly.rule || "unknown").toUpperCase()}
                </div>
                <h3 id={`anomaly-${anomaly.id}`} className="text-sm font-semibold truncate text-slate-900">
                  {title}
                </h3>
              </div>

              <div className="ml-2 text-xs text-slate-500">{new Date(anomaly.created_at || anomaly.issued_at || Date.now()).toLocaleString()}</div>
            </div>

            <p className="mt-2 text-sm text-slate-700 leading-snug truncate">{short || "No details provided."}</p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="text-xs text-slate-500">{anomaly.score ? `score ${anomaly.score}` : ""}</div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onView(anomaly)}
                className="inline-flex items-center gap-2 px-2 py-1 text-xs rounded-md border hover:bg-slate-50 transition"
                title="View details"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View
              </button>

              <button
                type="button"
                onClick={() => onAcknowledge(anomaly)}
                className="px-2 py-1 text-xs rounded-md bg-amber-100 hover:bg-amber-200 transition"
                title="Acknowledge"
              >
                Acknowledge
              </button>

              <button
                type="button"
                onClick={() => onResolve(anomaly)}
                className="px-2 py-1 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition"
                title="Resolve"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
