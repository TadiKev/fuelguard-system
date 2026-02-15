// src/services/anomalies.js
import api from "./api";

export async function listAnomalies({ stationId, pageSize = 50 } = {}) {
  try {
    const qs = stationId ? `?station=${encodeURIComponent(stationId)}&page_size=${pageSize}` : `?page_size=${pageSize}`;
    const res = await api.get(`anomalies/${qs}`);
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err?.response?.data || err.message };
  }
}

export async function acknowledgeAnomaly(anomalyId) {
  // try PATCH first, fallback to POST /anomalies/{id}/acknowledge/
  try {
    const res = await api.patch(`anomalies/${encodeURIComponent(anomalyId)}/`, { status: "acknowledged" });
    return { ok: true, data: res.data };
  } catch (e) {
    try {
      const r2 = await api.post(`anomalies/${encodeURIComponent(anomalyId)}/acknowledge/`);
      return { ok: true, data: r2.data };
    } catch (e2) {
      return { ok: false, error: e2?.response?.data || e2.message || e?.response?.data || "ack_failed" };
    }
  }
}

export async function resolveAnomaly(anomalyId) {
  try {
    const res = await api.patch(`anomalies/${encodeURIComponent(anomalyId)}/`, { status: "resolved" });
    return { ok: true, data: res.data };
  } catch (e) {
    try {
      const r2 = await api.post(`anomalies/${encodeURIComponent(anomalyId)}/resolve/`);
      return { ok: true, data: r2.data };
    } catch (e2) {
      return { ok: false, error: e2?.response?.data || e2.message || e?.response?.data || "resolve_failed" };
    }
  }
}
