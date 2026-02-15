// src/pages/ReceiptsVerify.jsx
import React, { useState, useEffect } from "react";
import { verifyReceiptToken } from "../services/receipts";

/**
 * Receipts verification page — styled and consistent with brand + dark mode
 * Keeps original verify logic intact.
 */

export default function ReceiptsVerifyPage() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // dark mode (read-only UI toggle not needed here, but we respect user's choice)
  useEffect(() => {
    // noop: page just respects `document.documentElement.classList` (set elsewhere)
  }, []);

  async function onVerify() {
    setResult(null);
    setLoading(true);
    try {
      const res = await verifyReceiptToken(token.trim());
      setResult({ ok: true, data: res });
    } catch (e) {
      // try to normalize error shape
      const err = e?.response?.data || e.server || e.message || e;
      setResult({ ok: false, error: err });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen py-8 bg-gradient-to-br from-sky-50 to-indigo-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-colors duration-300">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 flex items-center justify-center shadow text-white font-extrabold">FG</div>
            <div>
              <h2 className="text-2xl font-extrabold">VeReceipt</h2>
              <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">Paste a receipt token to verify its validity and details.</p>
            </div>
          </div>
        </div>

        <div className="bg-white/70 dark:bg-slate-800/60 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 shadow">
          <div className="flex gap-3 items-center">
            <input
              className="flex-1 border rounded p-3 bg-white dark:bg-slate-700/60"
              placeholder="Paste receipt token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button
              onClick={onVerify}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white font-semibold hover:bg-teal-700 transition"
              disabled={loading || !token.trim()}
            >
              {loading ? "Checking..." : "Verify"}
            </button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 dark:text-slate-300 mb-2">Result</div>
            <pre className="bg-slate-100 dark:bg-slate-800 p-4 rounded text-sm overflow-auto">
              {result ? (result.ok ? JSON.stringify(result.data, null, 2) : JSON.stringify({ error: result.error }, null, 2)) : "Enter token and click Verify"}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
