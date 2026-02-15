// src/components/PumpDetailsModal.jsx
import React, { useEffect, useState } from "react";
import api from "../services/api";

function kvListFromMetadata(md) {
  if (!md || typeof md !== "object") return [];
  return Object.keys(md).map((k) => ({ key: k, value: md[k] }));
}

export default function PumpDetailsModal({ open, onClose, pump }) {
  const [recentTxs, setRecentTxs] = useState([]);
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [hbBusy, setHbBusy] = useState(false);
  const [txError, setTxError] = useState(null);
  const [localPump, setLocalPump] = useState(pump);

  useEffect(() => {
    setLocalPump(pump);
  }, [pump]);

  useEffect(() => {
    if (!open || !pump?.id) {
      setRecentTxs([]);
      return;
    }
    // load recent transactions for this pump
    let mounted = true;
    async function loadTxs() {
      setLoadingTxs(true);
      setTxError(null);
      try {
        const res = await api.get(`pumps/${encodeURIComponent(pump.id)}/transactions/?page_size=10`);
        if (!mounted) return;
        setRecentTxs(Array.isArray(res.data) ? res.data : (res.data.results || []));
      } catch (err) {
        console.error("Failed to load pump transactions", err);
        setTxError("Failed to load recent transactions");
        // keep recentTxs as [] (no crash)
      } finally {
        if (mounted) setLoadingTxs(false);
      }
    }
    loadTxs();
    return () => { mounted = false; };
  }, [open, pump && pump.id]);

  if (!open || !pump) return null;

  // station label
  const stationLabel = (() => {
    if (!localPump.station) return "—";
    if (typeof localPump.station === "string") return String(localPump.station).slice(0, 8);
    if (typeof localPump.station === "object") {
      return localPump.station.name || localPump.station.code || (localPump.station.id ? String(localPump.station.id).slice(0, 8) : "—");
    }
    return "—";
  })();

  const fuel =
    localPump.fuel_type ??
    localPump.fuel ??
    localPump.metadata?.fuel_type ??
    localPump.metadata?.fuel ??
    "—";

  const nozzle = localPump.nozzle_id ?? localPump.nozzle ?? "—";

  let calibration = "1.000";
  try {
    calibration = Number(localPump.calibration_factor ?? localPump.metadata?.calibration_factor ?? 1.0).toFixed(3);
  } catch {
    calibration = String(localPump.calibration_factor ?? localPump.metadata?.calibration_factor ?? "1.0");
  }

  const formattedHeartbeat = (() => {
    try {
      if (!localPump.last_heartbeat) return "No heartbeat recorded";
      const dt = new Date(localPump.last_heartbeat);
      if (isNaN(dt.getTime())) return String(localPump.last_heartbeat);
      return dt.toLocaleString();
    } catch {
      return "No heartbeat recorded";
    }
  })();

  const status = (localPump.status_label ?? localPump.status ?? (localPump.is_online ? "online" : "offline") ?? "unknown").toString();

  // MARK HEARTBEAT
  async function markHeartbeat(forceOnline = true) {
    if (!localPump?.id) return;
    setHbBusy(true);
    try {
      const body = { force_online: !!forceOnline };
      const res = await api.post(`pumps/${encodeURIComponent(localPump.id)}/heartbeat/`, body);
      const updated = res.data;
      // update local pump view
      setLocalPump((prev) => ({ ...(prev || {}), ...(updated || {}) }));
      // notify global listeners (POS page will update pumps list / selected pump)
      try {
        window.dispatchEvent(new CustomEvent("fg:pump_updated", { detail: updated }));
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.error("heartbeat failed", err);
      alert("Failed to mark heartbeat. Check network / permissions.");
    } finally {
      setHbBusy(false);
    }
  }

  const metadataList = kvListFromMetadata(localPump.metadata);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 z-10">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h3 className="text-xl font-semibold">
              Pump {localPump.pump_number ?? (localPump.name ? localPump.name : String(localPump.id).slice(0, 8))}
            </h3>
            <div className="text-sm text-slate-500 mt-1">Station: {stationLabel}</div>
          </div>

          <div className="text-right">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
                status.toLowerCase() === "online" ? "bg-emerald-100 text-emerald-800" : status.toLowerCase() === "maintenance" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  status.toLowerCase() === "online" ? "bg-emerald-500 animate-pulse" : status.toLowerCase() === "maintenance" ? "bg-amber-500" : "bg-gray-400"
                }`}
              />
              <span className="uppercase">{status}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-slate-500">Fuel type</div>
            <div className="font-medium">{fuel}</div>
          </div>

          <div>
            <div className="text-xs text-slate-500">Nozzle id</div>
            <div className="font-medium">{nozzle}</div>
          </div>

          <div>
            <div className="text-xs text-slate-500">Calibration</div>
            <div className="font-medium">{calibration}</div>
          </div>

          <div>
            <div className="text-xs text-slate-500">Last seen</div>
            <div className="font-medium">{formattedHeartbeat}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => markHeartbeat(true)}
            disabled={hbBusy}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-sm"
            title="Update last seen timestamp and keep pump online"
          >
            {hbBusy ? "Updating…" : "Mark heartbeat now (stay online)"}
          </button>

          <button
            onClick={() => markHeartbeat(false)}
            disabled={hbBusy}
            className="px-4 py-2 border rounded-lg"
            title="Update last seen without forcing status field"
          >
            {hbBusy ? "Updating…" : "Mark heartbeat (no force)"}
          </button>

          <button onClick={onClose} className="px-4 py-2 border rounded-lg">Close</button>
        </div>

        {/* Transactions panel */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Recent transactions</h4>
            <div className="text-xs text-slate-500">{loadingTxs ? "Loading..." : (recentTxs.length ? `${recentTxs.length} shown` : "No recent transactions")}</div>
          </div>

          {txError && <div className="mt-2 text-xs text-rose-600">{txError}</div>}

          <div className="mt-3 space-y-2">
            {loadingTxs && <div className="text-sm text-slate-500">Loading transactions…</div>}
            {!loadingTxs && recentTxs.map((t) => (
              <div key={t.id} className="rounded-lg p-3 bg-slate-50 dark:bg-slate-800 border text-sm">
                <div className="flex justify-between">
                  <div className="font-medium">Tx {String(t.id).slice(0,8)}</div>
                  <div className="text-xs text-slate-500">{new Date(t.timestamp).toLocaleString()}</div>
                </div>
                <div className="text-xs text-slate-600 mt-1">Vol: {t.volume_l ?? "—"} L • Amount: {t.total_amount ?? "—"}</div>
                <div className="text-xs text-slate-500 mt-1">Attendant: {t.attendant ?? "—"}</div>
              </div>
            ))}
          </div>
        </div>

        {metadataList.length > 0 && (
          <div className="mt-4 text-sm">
            <div className="text-xs text-slate-500 mb-2">Metadata</div>
            <div className="grid grid-cols-1 gap-2">
              {metadataList.map(({ key, value }) => (
                <div key={key} className="flex justify-between items-start bg-slate-50 rounded p-2 text-xs">
                  <div className="text-slate-600 font-medium">{key}</div>
                  <div className="text-right text-slate-800 break-words">{typeof value === "object" ? JSON.stringify(value) : String(value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
