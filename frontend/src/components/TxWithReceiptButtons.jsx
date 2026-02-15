// src/components/TxWithReceiptButtons.jsx
import React, { useState } from "react";
import { createReceipt, listReceiptsForTransaction } from "../services/receipts";

export default function TxWithReceiptButtons({ tx, onReceiptCreated }) {
  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [err, setErr] = useState(null);

  async function makeReceipt() {
    setBusy(true);
    setErr(null);
    try {
      const payload = { transaction: tx.id, method: "sms", sent_to: tx.customer_phone ?? "" };
      const r = await createReceipt(payload);
      setBusy(false);
      if (r.ok) {
        setLastReceipt(r.data);
        onReceiptCreated?.(r.data);
      } else {
        setErr(r.error);
      }
    } catch (e) {
      setErr(e?.message || String(e));
      setBusy(false);
    }
  }

  async function loadReceipts() {
    setBusy(true);
    setErr(null);
    try {
      const r = await listReceiptsForTransaction(tx.id);
      setBusy(false);
      if (r.ok) {
        const pick = Array.isArray(r.data) ? r.data[0] : r.data;
        setLastReceipt(pick || null);
      } else {
        setErr(r.error);
      }
    } catch (e) {
      setErr(e?.message || String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex gap-2">
        <button onClick={makeReceipt} disabled={busy} className="px-2 py-1 bg-green-600 text-white rounded">
          {busy ? "Working..." : "Create receipt"}
        </button>
        <button onClick={loadReceipts} disabled={busy} className="px-2 py-1 border rounded">
          Load receipts
        </button>
      </div>

      {err && <div className="text-red-600">{JSON.stringify(err)}</div>}

      {lastReceipt && (
        <div className="mt-2 text-xs bg-slate-50 p-2 rounded">
          <div><strong>receipt_token:</strong></div>
          <div className="break-all text-xs"><code>{lastReceipt.receipt_token}</code></div>
          <div className="mt-2">
            <img alt="qr" src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(lastReceipt.receipt_token)}`} />
          </div>
        </div>
      )}
    </div>
  );
}
