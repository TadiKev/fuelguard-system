// src/components/ReceiptVerifyForm.jsx
import React, { useState } from "react";
import { verifyReceipt } from "../services/receipts";

export default function ReceiptVerifyForm({ onResult }) {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setErr(null);
    setResult(null);

    const r = await verifyReceipt(token.trim());
    setLoading(false);

    if (r.ok) {
      setResult(r.data);
      onResult?.(r.data);
    } else {
      setErr(r.error || "Verification failed");
    }
  };

  return (
    <div className="max-w-lg bg-white p-4 rounded shadow">
      <h3 className="font-medium mb-3">Verify receipt token</h3>
      <form onSubmit={submit}>
        <label className="block mb-2">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste receipt token here"
            className="w-full border p-2 rounded"
          />
        </label>

        <div className="flex gap-2">
          <button disabled={loading || !token.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded">
            {loading ? "Verifying..." : "Verify"}
          </button>
          <button
            type="button"
            onClick={() => {
              setToken("");
              setResult(null);
              setErr(null);
            }}
            className="px-4 py-2 border rounded"
          >
            Clear
          </button>
        </div>
      </form>

      <div className="mt-4">
        {err && <pre className="text-red-600">{JSON.stringify(err, null, 2)}</pre>}

        {result && (
          <div className="text-sm">
            <div><strong>Valid:</strong> {String(result.valid)}</div>

            <div className="mt-2"><strong>Receipt payload:</strong></div>
            <pre className="text-xs bg-slate-50 p-2 rounded">{JSON.stringify(result.receipt || result, null, 2)}</pre>

            {/* show QR for the token if valid */}
            {result.valid && result.receipt?.receipt_token && (
              <div className="mt-3">
                <h4 className="font-medium">Receipt QR</h4>
                {/* Using a public QR image generator - no dependency */}
                <img
                  alt="receipt-qr"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(result.receipt.receipt_token)}`}
                />
                <div className="mt-1 text-xs break-all">{result.receipt.receipt_token}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
