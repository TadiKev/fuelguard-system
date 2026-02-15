// src/components/CreateReceiptButton.jsx
import React, { useState } from "react";
import { generateReceipt } from "../services/receipts";

export default function CreateReceiptButton({ transactionId, defaultSentTo = "" }) {
  const [sentTo, setSentTo] = useState(defaultSentTo);
  const [method, setMethod] = useState("sms");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  async function onCreate() {
    setMessage(null);
    setLoading(true);
    try {
      const data = await generateReceipt({ transaction_id: transactionId, method, sent_to: sentTo });
      setMessage({ type: "success", text: `Receipt created — token: ${data.receipt_token || data.id}` });
    } catch (err) {
      if (err.clientValidation) {
        setMessage({ type: "error", text: `Validation: ${JSON.stringify(err.clientValidation)}` });
      } else if (err.server) {
        setMessage({ type: "error", text: `Server(${err.status}): ${JSON.stringify(err.server)}` });
      } else {
        setMessage({ type: "error", text: err.message || "Unknown error" });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select value={method} onChange={e => setMethod(e.target.value)} className="border p-1">
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </select>
        <input className="border p-1 flex-1" value={sentTo} onChange={e=>setSentTo(e.target.value)} placeholder="phone or email (required)" />
        <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={onCreate} disabled={loading}>
          {loading ? "Creating..." : "Create Receipt"}
        </button>
      </div>
      {message && <div className={message.type === "error" ? "text-red-600" : "text-green-600"}>{message.text}</div>}
    </div>
  );
}
