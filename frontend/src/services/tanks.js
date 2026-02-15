// src/services/tanks.js
import api from "./api";

export async function listTanksForStation(stationId) {
  if (!stationId) return { ok: false, error: "stationId required" };
  try {
    const res = await api.get(`tanks/?station=${encodeURIComponent(stationId)}`);
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err?.response?.data || err.message };
  }
}

export async function listTankReadings(tankId, pageSize = 10) {
  if (!tankId) return { ok: false, error: "tankId required" };
  try {
    const res = await api.get(`tanks/${encodeURIComponent(tankId)}/readings/?page_size=${pageSize}`);
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err?.response?.data || err.message };
  }
}

// Ask backend to run reconcile for given tank (endpoint may vary)
export async function requestTankReconcile(tankId) {
  if (!tankId) return { ok: false, error: "tankId required" };
  try {
    // adjust endpoint if your backend exposes a different route
    const res = await api.post(`tanks/${encodeURIComponent(tankId)}/reconcile/`);
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err?.response?.data || err.message };
  }
}
