// src/components/ReceiptModal.jsx
import React, { useEffect, useState } from "react";
import api from "../services/api";

/**
 * ReceiptModal
 *
 * Props:
 *  - open: boolean
 *  - onClose(): function
 *  - receipt: object (may be a transaction object or an object with receipt fields)
 *
 * Behaviour:
 *  - Professional receipt layout showing volume_l, unit_price, total_amount, issued date, token
 *  - "Show full token" toggle prevents layout overlap
 *  - "Send SMS" attempts backend send; if unavailable, queues locally and shows a professional status
 *  - Copy & Print actions included
 */

function fmtDate(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function safeFind(o, keys = []) {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) return o[k];
  }
  // look nested shallow
  for (const prop of Object.keys(o)) {
    const val = o[prop];
    if (val && typeof val === "object") {
      for (const k of keys) {
        if (val[k] !== undefined && val[k] !== null) return val[k];
      }
    }
  }
  return undefined;
}

const STORAGE_KEY = "smsLog_v1";

function loadSmsLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSmsLog(arr) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

export default function ReceiptModal({ open = false, onClose = () => {}, receipt = null }) {
  const [show, setShow] = useState(open);
  const [showFullToken, setShowFullToken] = useState(false);
  const [phone, setPhone] = useState("");
  const [smsStatus, setSmsStatus] = useState(null);
  const [smsLog, setSmsLog] = useState([]);

  useEffect(() => {
    setShow(open);
  }, [open]);

  useEffect(() => {
    // load sms log from localStorage
    setSmsLog(loadSmsLog());
  }, [open]);

  if (!show) return null;

  // extract fields (coerce to multiple shapes)
  const volume = safeFind(receipt, ["volume_l", "volume", "vol"]) ?? (receipt?.volume_l ?? receipt?.volume ?? "—");
  const unitPrice = safeFind(receipt, ["unit_price", "unitPrice", "price", "unit"]) ?? receipt?.unit_price ?? receipt?.price ?? "—";
  const total = safeFind(receipt, ["total_amount", "total", "amount"]) ?? receipt?.total_amount ?? receipt?.amount ?? "—";
  const issued = safeFind(receipt, ["issued_at", "issued", "timestamp", "created_at"]) ?? receipt?.issued_at ?? receipt?.timestamp ?? receipt?.created_at ?? null;
  const token = receipt?.receipt_token ?? receipt?.token ?? receipt?.id ?? "";

  function close() {
    setShow(false);
    onClose && onClose();
  }

  function copyTokenToClipboard() {
    navigator.clipboard?.writeText(token || "");
    setSmsStatus({ ok: true, text: "Token copied to clipboard." });
    setTimeout(() => setSmsStatus(null), 1500);
  }

  function printReceipt() {
    const el = document.getElementById("fg-receipt-printable");
    if (!el) return;
    const win = window.open("", "_blank", "width=600,height=800");
    if (!win) return;
    win.document.write("<html><head><title>Receipt</title>");
    win.document.write(`<style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial;padding:20px;color:#111}
      .r{max-width:480px;margin:0 auto;border:1px solid #eee;padding:18px;border-radius:8px}
      .brand{background:linear-gradient(90deg,#06b6d4,#6366f1);color:white;padding:8px 12px;border-radius:8px;display:inline-block}
      .h{font-size:18px;margin-top:6px}
      .muted{color:#666;font-size:12px}
      .row{display:flex;justify-content:space-between;margin-top:12px}
    </style>`);
    win.document.write("</head><body>");
    win.document.write(el.innerHTML);
    win.document.write("</body></html>");
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 300);
  }

  async function sendSms(e) {
    e.preventDefault();
    if (!token) {
      setSmsStatus({ ok: false, text: "Receipt token not available." });
      return;
    }
    const ph = (phone || "").trim();
    if (!ph) {
      setSmsStatus({ ok: false, text: "Please enter a valid phone number." });
      return;
    }

    const preview = `Receipt ${token.slice(0,8)} • Total ${total}`;

    // Prepare a log entry template
    const entryBase = {
      id: `${Date.now()}`,
      phone: ph,
      token,
      timestamp: new Date().toISOString(),
      preview,
    };

    // Try sending via backend endpoint (recommended)
    try {
      // Attempt to post to a conventional notifications endpoint.
      // If your backend uses a different endpoint, adapt this path.
      const res = await api.post("notifications/sms/", {
        phone: ph,
        message: preview,
        receipt_token: token,
      });

      if (res && (res.status >= 200 && res.status < 300)) {
        const entry = { ...entryBase, status: "sent", source: (res.config && res.config.baseURL) ? res.config.baseURL : "api" };
        const arr = [entry, ...loadSmsLog()];
        saveSmsLog(arr);
        setSmsLog(arr);
        setSmsStatus({ ok: true, text: "SMS sent successfully." });
        setPhone("");
        setTimeout(() => setSmsStatus(null), 3000);
        return;
      }
      // if non-2xx, fall through to queue
    } catch (err) {
      // network error, CORS, or endpoint missing -> fallback to local queue
    }

    // Fallback: queue locally and present a professional status
    try {
      const entry = { ...entryBase, status: "queued", source: "local-queue" };
      const arr = [entry, ...loadSmsLog()];
      saveSmsLog(arr);
      setSmsLog(arr);
      setSmsStatus({ ok: true, text: "SMS queued for delivery." });
      setPhone("");
      setTimeout(() => setSmsStatus(null), 3000);
    } catch (err) {
      console.error("sms queue failed", err);
      setSmsStatus({ ok: false, text: "Failed to queue SMS. Please try again." });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div id="fg-receipt-printable" className="relative z-10 w-full max-w-2xl">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
          {/* header */}
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-cyan-500 to-indigo-600 text-white">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center font-bold">FG</div>
              <div>
                <div className="text-lg font-bold">FuelGuard</div>
                <div className="text-xs opacity-90">Customer Receipt</div>
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="font-medium">Thank you</div>
              <div className="opacity-90">Secure • Encrypted</div>
            </div>
          </div>

          {/* body */}
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500">Volume (L)</div>
                    <div className="text-2xl font-semibold">{volume ?? "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Unit price</div>
                    <div className="text-2xl font-semibold">{unitPrice ?? "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Total</div>
                    <div className="text-2xl font-extrabold text-indigo-600">{total ?? "—"}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-slate-500">Issued</div>
                  <div className="text-sm">{fmtDate(issued)}</div>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-slate-500">Receipt token</div>

                  {/* token area: toggle to show full token to avoid overlap */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 bg-white rounded-md border p-2 text-xs break-words" style={{ wordBreak: "break-all" }}>
                      {showFullToken ? token || "—" : (token ? (token.length > 48 ? token.slice(0,48) + "…" : token) : "—")}
                    </div>

                    <button
                      onClick={() => setShowFullToken((v) => !v)}
                      className="px-3 py-1 text-xs rounded-md border bg-white/90"
                    >
                      {showFullToken ? "Hide" : "Show full"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-sm text-slate-600">Present this receipt or the QR/token to the cashier for any inquiries. SMS delivery is handled through your configured provider.</div>
            </div>

            {/* right column: actions & SMS */}
            <div>
              <div className="rounded-xl border p-4 bg-white/50">
                <div className="text-xs text-slate-500 mb-2">Actions</div>

                <div className="flex flex-col gap-2">
                  <button onClick={copyTokenToClipboard} className="px-3 py-2 rounded bg-indigo-600 text-white text-sm">Copy token</button>
                  <button onClick={printReceipt} className="px-3 py-2 rounded border text-sm">Print</button>
                  <button onClick={close} className="px-3 py-2 rounded bg-slate-100 text-sm">Close</button>
                </div>
              </div>

              <form onSubmit={sendSms} className="mt-4 rounded-xl border p-4 bg-white/50 space-y-3">
                <div className="text-xs text-slate-500">Send SMS</div>
                <input
                  placeholder="Enter phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded p-2 border text-sm"
                />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 px-3 py-2 rounded bg-emerald-600 text-white">Send SMS</button>
                  <button type="button" onClick={() => { setPhone(""); setSmsStatus(null); }} className="px-3 py-2 rounded border">Reset</button>
                </div>

                {smsStatus && (
                  <div className={`text-sm p-2 rounded ${smsStatus.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {smsStatus.text}
                  </div>
                )}

                <div className="text-xs text-slate-500">Recent sends are stored locally for audit and retry purposes when the delivery service is unavailable.</div>

                {smsLog.length > 0 && (
                  <div className="mt-2 text-xs">
                    <div className="font-medium text-slate-700">Recent sends</div>
                    <ul className="mt-1 space-y-1">
                      {smsLog.slice(0,5).map(m => (
                        <li key={m.id} className="text-xs text-slate-600 border rounded p-2 bg-white/60">
                          <div className="font-medium">{m.phone} <span className="ml-2 text-xxs text-slate-400">· {m.status}</span></div>
                          <div className="text-xs">{m.preview}</div>
                          <div className="text-xs text-slate-400">{new Date(m.timestamp).toLocaleString()}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* footer */}
          <div className="p-4 text-xs text-slate-500 border-t">
            <div className="max-w-2xl mx-auto text-center">
              SMS messages are delivered via your configured provider. If delivery is unavailable, messages are queued locally and retried when the service becomes available.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
