// src/services/receipts.js
import api from "./api";

function normalizeCreatePayload(payload = {}) {
  const tx = payload.transaction || payload.transaction_id || payload.transactionId || payload.tx;
  const method = payload.method || "sms";
  const sent_to = payload.sent_to ?? payload.sentTo ?? payload.to ?? "";
  return { transaction_id: tx, method, sent_to };
}

export async function generateReceipt({ transaction_id, method = "sms", sent_to = "" }) {
  if (!transaction_id) {
    const err = new Error("transaction_id is required");
    err.clientValidation = { transaction_id: "required" };
    throw err;
  }
  const body = { transaction_id, method, sent_to };
  const res = await api.post("receipts/generate/", body);
  return res.data;
}

export async function verifyReceiptToken(token) {
  if (!token) throw new Error("token required");
  try {
    const res = await api.get(`receipts/${encodeURIComponent(token)}/verify/`);
    return res.data;
  } catch (e) {
    const res2 = await api.post("receipts/verify/", { receipt_token: token });
    return res2.data;
  }
}

export async function getReceiptsForTransaction(transactionId) {
  if (!transactionId) throw new Error("transaction id required");
  try {
    const res = await api.get(`receipts/?transaction=${encodeURIComponent(transactionId)}`);
    return res.data;
  } catch (e) {
    try {
      const r2 = await api.get(`transactions/${encodeURIComponent(transactionId)}/`);
      return { fallbackTransaction: true, transaction: r2.data };
    } catch (err) {
      const error = new Error("fetch_failed");
      error.server = err?.response?.data;
      error.status = err?.response?.status;
      throw error;
    }
  }
}

export async function createReceipt(payload = {}) {
  const { transaction_id, method, sent_to } = normalizeCreatePayload(payload);

  try {
    const data = await generateReceipt({ transaction_id, method, sent_to });
    return { ok: true, data };
  } catch (e) {
    const serverData = e?.response?.data || e?.server;
    const status = e?.response?.status || e?.status;
    if (status === 404 || status === 405) {
      try {
        const body = { transaction: transaction_id, method, sent_to };
        const res = await api.post("receipts/", body);
        return { ok: true, data: res.data };
      } catch (e2) {
        return { ok: false, error: e2?.response?.data || e2.message || serverData || "create_failed" };
      }
    }
    return { ok: false, error: serverData || e.message || "create_failed" };
  }
}

export async function listReceiptsForTransaction(transactionId) {
  if (!transactionId) return { ok: false, error: "transactionId required" };
  try {
    const res = await api.get(`receipts/?transaction=${encodeURIComponent(transactionId)}`);
    return { ok: true, data: res.data };
  } catch (e) {
    try {
      const r2 = await api.get(`transactions/${encodeURIComponent(transactionId)}/`);
      const tx = r2.data;
      if (tx?.receipt) {
        return { ok: true, data: Array.isArray(tx.receipt) ? tx.receipt : [tx.receipt] };
      }
      return { ok: false, error: r2.data || "no_receipts_found" };
    } catch (err) {
      return { ok: false, error: err?.response?.data || err.message || "list_failed" };
    }
  }
}
