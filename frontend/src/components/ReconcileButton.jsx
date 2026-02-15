// src/components/ReconcileButton.jsx
import React, { useState } from "react";
import api from "../services/api";

/**
 * ReconcileButton — station-level reconcile trigger.
 * Visible when stationId is provided.
 *
 * Emits global 'fg:reconcile_done' and 'fg:reconcile_requested' events on success
 * with detail { stationId, summary } to allow UI refresh.
 */
export default function ReconcileButton({ stationId, onDone }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function runReconcile() {
    if (!stationId) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.post(`reconcile/station/${encodeURIComponent(stationId)}/`, {
        create_anomalies: true
      });
      const summary = res.data?.summary || res.data;
      setResult(summary);
      // emit events for UI refresh and notification
      window.dispatchEvent(new CustomEvent("fg:reconcile_requested", { detail: { stationId, summary } }));
      window.dispatchEvent(new CustomEvent("fg:reconcile_done", { detail: { stationId, summary } }));
      if (typeof onDone === "function") onDone(summary);
    } catch (err) {
      console.error("Reconcile failed", err);
      setError(err?.response?.data || err.message || "Failed");
    } finally {
      setBusy(false);
      // clear result after a short delay so header doesn't stay cluttered
      setTimeout(() => setResult(null), 7000);
      setTimeout(() => setError(null), 7000);
    }
  }

  return (
    <div className="inline-flex flex-col gap-2 items-end">
      <button
        onClick={runReconcile}
        disabled={busy || !stationId}
        className={`px-4 py-2 rounded-md text-sm font-medium ${busy ? "bg-gray-400 text-white" : "bg-rose-600 text-white hover:bg-rose-700"}`}
      >
        {busy ? "Reconciling..." : "Run Reconcile (Station)"}
      </button>

      {result && (
        <div className="p-2 bg-slate-50 rounded text-sm text-right">
          <div><strong>Checked:</strong> {result.summary?.total_checked ?? (result.checked_tanks || []).length}</div>
          <div><strong>Anomalies:</strong> {result.summary?.anomalies ?? 0}</div>
        </div>
      )}

      {error && (
        <div className="p-2 text-rose-700 bg-rose-50 rounded text-sm">{typeof error === "string" ? error : JSON.stringify(error)}</div>
      )}
    </div>
  );
}
