// src/components/RunReconcileButton.jsx
import React, { useState } from "react";
import api from "../services/api";

/**
 * RunReconcileButton — tank-level reconcile trigger.
 * Shows only if tankId is provided.
 *
 * Emits global event 'fg:reconcile_requested' with detail { tankId } on success
 * so other UI parts (AttendantPOS) can refresh.
 */
export default function RunReconcileButton({ tankId, onDone }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!tankId) return null;

  async function runReconcile() {
    setBusy(true);
    setMsg(null);
    try {
      // Call your existing tank reconcile action — we expect an action on TankViewSet named 'reconcile'
      await api.post(`tanks/${encodeURIComponent(tankId)}/reconcile/`, {});
      setMsg({ type: "success", text: "Reconciliation requested." });
      // emit an event so other UI can refresh
      window.dispatchEvent(new CustomEvent("fg:reconcile_requested", { detail: { tankId } }));
      if (typeof onDone === "function") onDone();
    } catch (err) {
      console.error("reconcile failed", err);
      const detail = err?.response?.data?.detail || err?.response?.data || err?.message || "Failed to request reconcile";
      setMsg({ type: "error", text: String(detail) });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 5000);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        className={`px-3 py-2 rounded font-semibold w-full ${busy ? "opacity-70 cursor-wait bg-indigo-500 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
        onClick={runReconcile}
        disabled={busy}
      >
        {busy ? "Running…" : "Run Reconciliation (Tank)"}
      </button>
      {msg && (
        <div className={`text-sm ${msg.type === "error" ? "text-rose-600" : "text-emerald-700"}`}>{msg.text}</div>
      )}
    </div>
  );
}
