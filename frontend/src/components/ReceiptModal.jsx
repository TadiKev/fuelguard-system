// src/components/ReceiptModal.jsx
import React, { useState } from "react";
import api from "../services/api";

export default function ReceiptModal({ open, onClose, receipt }) {
  const [smsNumber, setSmsNumber] = useState("");
  if (!open || !receipt) return null;

  const qrData =
    receipt.receipt_token ||
    receipt.receipt_token ||
    JSON.stringify(receipt);

  async function copyQR() {
    try {
      await navigator.clipboard.writeText(qrData);
      alert("Receipt token/QR copied to clipboard!");
    } catch {
      alert("Copy failed — try manual select.");
    }
  }

  function printReceipt() {
    const html = `
      <html>
        <head>
          <title>Receipt</title>
          <style>
            body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:20px}
            .box{max-width:600px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:8px}
          </style>
        </head>
        <body>
          <div class="box">
            <h2>Receipt</h2>
            <p><strong>Transaction ID:</strong> ${String(receipt.id).slice(0, 8)}</p>
            <p><strong>Volume:</strong> ${receipt.volume_l ?? "—"} L</p>
            <p><strong>Amount:</strong> ${receipt.total_amount ?? "—"}</p>
            <p><strong>Issued at:</strong> ${new Date(
              receipt.timestamp || receipt.issued_at || Date.now()
            ).toLocaleString()}</p>
            <pre style="word-break:break-word;padding:10px;border:1px dashed #ccc">${qrData}</pre>
          </div>
        </body>
      </html>`;
    const w = window.open("", "_blank");
    if (!w) return alert("Popup blocked — allow popups for printing.");
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  async function sendSMS() {
    if (!smsNumber) {
      alert("Enter phone number");
      return;
    }
    try {
      await api.post("receipts/send-sms/", {
        receipt_token: qrData,
        to: smsNumber,
      });
      alert(`Sent to ${smsNumber}`);
      setSmsNumber("");
    } catch (e) {
      alert(
        "Send SMS failed: " +
          JSON.stringify(e?.response?.data || e?.message)
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Transaction Receipt
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Details */}
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-gray-500">Transaction ID</p>
              <p className="font-medium">
                #{String(receipt.id).slice(0, 8)}
              </p>
            </div>

            <div>
              <p className="text-gray-500">Volume</p>
              <p className="font-medium">
                {receipt.volume_l ?? "—"} L
              </p>
            </div>

            <div>
              <p className="text-gray-500">Total Amount</p>
              <p className="font-medium">
                {receipt.total_amount ?? "—"}
              </p>
            </div>

            <div>
              <p className="text-gray-500">Issued At</p>
              <p className="font-medium">
                {new Date(
                  receipt.timestamp ||
                    receipt.issued_at ||
                    Date.now()
                ).toLocaleString()}
              </p>
            </div>
          </div>

          {/* QR */}
          <div className="flex flex-col items-center justify-center border rounded-xl p-4 bg-gray-50">
            <img
              alt="qr"
              className="h-44 w-44 rounded"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                qrData
              )}`}
            />
            <p className="mt-3 text-xs text-gray-500 break-all text-center">
              {qrData}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={copyQR}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition"
            >
              Copy QR / Token
            </button>

            <button
              onClick={printReceipt}
              className="w-full rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 transition"
            >
              Print Receipt
            </button>
          </div>

          <div className="flex gap-2">
            <input
              value={smsNumber}
              onChange={(e) => setSmsNumber(e.target.value)}
              placeholder="+2637..."
              className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={sendSMS}
              className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 transition"
            >
              Send SMS
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full rounded-lg border bg-gray-100 py-2 text-sm hover:bg-gray-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
