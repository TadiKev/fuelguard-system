// src/services/transactions.js
import api from "./api";

/**
 * Fetch transactions for a station (supports backend pagination).
 * params can include page_size, page, etc.
 * Returns { ok: true, data } or { ok: false, error }
 */
export async function fetchTransactionsByStation(stationId, params = {}) {
  if (!stationId) return { ok: false, error: "no_station_id" };
  try {
    const qs = new URLSearchParams(params).toString();
    const url = `transactions/?station=${encodeURIComponent(stationId)}${qs ? "&" + qs : ""}`;
    const r = await api.get(url);
    return { ok: true, data: r.data };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message || "fetch_failed" };
  }
}

/**
 * Fetch a single transaction by id (if backend supports /transactions/<id>/)
 */
export async function fetchTransaction(txId) {
  try {
    const r = await api.get(`transactions/${txId}/`);
    return { ok: true, data: r.data };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message || "fetch_failed" };
  }
}
