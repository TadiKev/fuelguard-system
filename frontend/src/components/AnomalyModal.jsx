// src/components/AnomalyModal.jsx
import React, { useEffect, useState } from "react";
import { listTankReadings, requestTankReconcile } from "../services/tanks";

export default function AnomalyModal({ open, anomaly, onClose, onAcknowledge, onResolve }) {
  const [readings, setReadings] = useState(null);
  const [loadingReadings, setLoadingReadings] = useState(false);
  const [reconStatus, setReconStatus] = useState(null);

  useEffect(() => {
    if (!open || !anomaly) return;
    setReadings(null);
    setReconStatus(null);

    const tankId = anomaly?.details?.tank_id || anomaly?.details?.tank;
    if (!tankId) return;

    let mounted = true;
    (async () => {
      setLoadingReadings(true);
      const r = await listTankReadings(tankId, 8);
      if (!mounted) return;
      if (r.ok) setReadings(r.data.results || r.data);
      else setReadings({ error: r.error });
      setLoadingReadings(false);
    })();

    return () => { mounted = false; };
  }, [open, anomaly]);

  if (!open || !anomaly) return null;

  const details = anomaly.details || {};

  async function handleReconcile() {
    const tankId = details?.tank_id || details?.tank;
    if (!tankId) {
      setReconStatus({ ok: false, message: "No tank_id in anomaly details" });
      return;
    }
    setReconStatus({ working: true });
    const r = await requestTankReconcile(tankId);
    if (r.ok) setReconStatus({ ok: true, message: "Reconciliation requested — check backend logs/tasks." });
    else setReconStatus({ ok: false, message: JSON.stringify(r.error) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-xl p-6 overflow-auto max-h-[90vh]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">{anomaly.name || anomaly.rule}</h3>
            <div className="text-sm text-gray-500">{anomaly.rule} • {anomaly.severity}</div>
            <div className="text-xs text-gray-400 mt-1">Created: {new Date(anomaly.created_at || Date.now()).toLocaleString()}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onAcknowledge(anomaly)} className="px-3 py-1 rounded bg-yellow-100">Acknowledge</button>
            <button onClick={() => onResolve(anomaly)} className="px-3 py-1 rounded bg-green-600 text-white">Resolve</button>
            <button onClick={onClose} className="px-3 py-1 rounded border">Close</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-sm mb-2">Details</h4>
            <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto">{JSON.stringify(details, null, 2)}</pre>
          </div>

          <div>
            <h4 className="font-medium text-sm mb-2">Tank audit</h4>
            {loadingReadings && <div className="text-sm text-gray-500">Loading tank readings…</div>}
            {!loadingReadings && readings && (
              readings.error ? (
                <div className="text-sm text-rose-600">Failed to load readings: {JSON.stringify(readings.error)}</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-gray-600">Showing latest readings (server time)</div>
                  <ul className="text-sm">
                    {readings.length === 0 && <li className="text-gray-400">No readings</li>}
                    {readings.map(r => (
                      <li key={r.id} className="p-2 border rounded bg-white">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">{r.level_l} L</div>
                          <div className="text-xs text-gray-500">{new Date(r.measured_at).toLocaleString()}</div>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">source: {r.source || "unknown"}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}

            <div className="mt-4">
              <button onClick={handleReconcile} className="px-3 py-2 bg-indigo-600 text-white rounded">
                Request Reconcile
              </button>
              {reconStatus && (
                <div className={`mt-2 text-sm ${reconStatus.ok ? "text-green-700" : "text-rose-600"}`}>
                  {reconStatus.working ? "Requesting…" : reconStatus.message}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
