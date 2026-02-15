import React, { useState } from "react";
import api from "../services/api";
import PumpDetailsModal from "./PumpDetailsModal";

/**
 * PumpCard — displays friendly info and fetches details for modal if needed.
 *
 * Props:
 *  - pump: object (may be minimal: {id, pump_number})
 *  - onOpen(pump): callback used for selection
 *  - selected: boolean
 */

export default function PumpCard({ pump = {}, onOpen, selected = false }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fullPump, setFullPump] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState(null);

  // local display fallbacks
  const pumpId = pump.id ?? pump.pk ?? "";
  const pumpNumber =
    pump.pump_number ??
    pump.number ??
    (pump.name ? pump.name : pumpId ? String(pumpId).slice(0, 8) : "—");

  const fuel =
    pump.fuel_type ??
    pump.fuel ??
    pump.metadata?.fuel_type ??
    pump.metadata?.fuel ??
    "—";

  const nozzle = pump.nozzle_id ?? pump.nozzle ?? "—";

  // calibration as number-ish, formatted to 3 decimals when possible
  const calibrationRaw =
    pump.calibration_factor ??
    pump.calibration ??
    pump.metadata?.calibration_factor ??
    "1.0";
  let calibration = "1.000";
  try {
    calibration = Number(calibrationRaw).toFixed(3);
  } catch {
    calibration = String(calibrationRaw);
  }

  // status priority: status_label (model property) -> status field -> is_online boolean
  const statusLabel =
    (pump.status_label ?? pump.status ?? (pump.is_online ? "online" : "offline") ?? "unknown")
      .toString()
      .toLowerCase();

  const status = statusLabel;

  function handleSelect(e) {
    e?.stopPropagation();
    if (typeof onOpen === "function") onOpen(pump); // note: pass original pump object; parent can decide
  }

  async function openDetails(e) {
    e?.stopPropagation();
    setDetailsError(null);

    // If object already has detailed fields, reuse it
    const hasDetails =
      !!(
        pump.fuel_type ||
        pump.nozzle_id ||
        pump.calibration_factor ||
        pump.last_heartbeat ||
        (pump.metadata && Object.keys(pump.metadata).length > 0) ||
        pump.status_label
      );

    if (hasDetails) {
      setFullPump(pump);
      setDetailsOpen(true);
      return;
    }

    // otherwise fetch from API: GET /pumps/<id>/
    if (!pumpId) {
      setDetailsError("No pump id");
      setFullPump(pump);
      setDetailsOpen(true);
      return;
    }
    setLoadingDetails(true);
    try {
      const res = await api.get(`pumps/${encodeURIComponent(pumpId)}/`);
      setFullPump(res.data);
      setDetailsOpen(true);
    } catch (err) {
      setDetailsError("Failed to load details (showing minimal info)");
      console.error("Pump details fetch failed", err);
      // fallback: show a minimal object with id/number
      setFullPump(pump);
      setDetailsOpen(true);
    } finally {
      setLoadingDetails(false);
    }
  }

  const statusClasses =
    status === "online"
      ? "bg-emerald-100 text-emerald-800"
      : status === "offline"
      ? "bg-gray-100 text-gray-600"
      : "bg-amber-100 text-amber-800";

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleSelect(e);
          }
        }}
        className={`p-4 rounded-2xl border transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          selected
            ? "ring-2 ring-indigo-400 bg-gradient-to-br from-white to-indigo-50 border-indigo-200 shadow-[0_10px_30px_rgba(99,102,241,0.10)]"
            : "bg-white/80 border-slate-200 hover:shadow-lg"
        }`}
        aria-pressed={selected}
      >
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-teal-400 to-indigo-500 text-white shadow-md flex-shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l2 8 4-16 3 12h3" />
              </svg>
            </div>

            <div className="min-w-0">
              <div className="text-lg font-semibold text-slate-900 truncate">Pump {pumpNumber}</div>
              <div className="text-sm text-slate-500">
                Fuel: <span className="font-medium text-slate-700">{fuel}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">Nozzle: {nozzle}</div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${statusClasses}`}>
              <span
                className={`w-2 h-2 rounded-full ${
                  status === "online" ? "bg-emerald-500 animate-pulse" : status === "offline" ? "bg-gray-400" : "bg-amber-500"
                }`}
              />
              <span className="uppercase">{status}</span>
            </div>

            <div className="text-xs text-slate-400">Cal: {calibration}</div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSelect}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-semibold text-white transition ${
              selected ? "bg-indigo-600 hover:bg-indigo-700" : "bg-teal-600 hover:bg-teal-700"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            Select
          </button>

          <button
            onClick={openDetails}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border bg-white/60 hover:bg-white transition"
            aria-disabled={loadingDetails}
            title={loadingDetails ? "Loading details..." : "View details"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m4-4h.01M12 20h.01" />
            </svg>
            {loadingDetails ? "Loading..." : "Details"}
          </button>
        </div>

        {detailsError && <div className="mt-2 text-xs text-rose-600">{detailsError}</div>}
      </div>

      <PumpDetailsModal open={detailsOpen} onClose={() => setDetailsOpen(false)} pump={fullPump || pump} />
    </>
  );
}
