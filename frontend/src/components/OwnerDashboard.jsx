import React, { useEffect, useRef, useState, useMemo } from "react";
import api, { API_BASE } from "../services/api";
import ReconnectingWS from "../services/ws";
import PumpCard from "../components/PumpCard";
import TransactionList from "../components/TransactionList";
import AnomalyList from "../components/AnomalyList";
import ReceiptModal from "../components/ReceiptModal";
import RulesManager from "../components/RulesManager";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/**
 * OwnerDashboard — styling-only update (NO logic changes)
 * - removed dark-mode hook to keep styles consistent and simple
 * - improved colors, glass cards, spacing and typography
 */

export default function OwnerDashboard() {
  const [station, setStation] = useState(null);
  const [pumps, setPumps] = useState([]);
  const [tx, setTx] = useState([]);
  const [anoms, setAnoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptForTx, setReceiptForTx] = useState(null);
  const wsRef = useRef(null);

  // friendly fixed chart colors for light UI
  const chartStroke = "#0369a1"; // deep-sky blue
  const chartFill = "rgba(3,105,161,0.08)";

  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      setLoading(true);
      try {
        const r = await api.get("stations/");
        const stationObj =
          r.data?.results?.[0] || (Array.isArray(r.data) ? r.data[0] : r.data);
        if (!stationObj) {
          setLoading(false);
          return;
        }
        if (!mounted) return;
        setStation(stationObj);

        const [pumpsR, txR, anomsR] = await Promise.allSettled([
          api.get(`stations/${stationObj.id}/pumps/`),
          api.get(
            `stations/${stationObj.id}/transactions/?page_size=20`
          ),
          api.get(`stations/${stationObj.id}/anomalies/?page_size=20`),
        ]);

        if (pumpsR.status === "fulfilled") {
          const list = pumpsR.value.data?.results || pumpsR.value.data || [];
          setPumps(list.map(normalizePump));
        }

        if (txR.status === "fulfilled") {
          const list = txR.value.data?.results || txR.value.data || [];
          setTx(list);
        }

        if (anomsR.status === "fulfilled") {
          const list = anomsR.value.data?.results || anomsR.value.data || [];
          setAnoms(list);
        }

        // websocket
        const wsUrl = buildWsUrl(stationObj.id);
        const ws = new ReconnectingWS(wsUrl, { getToken: () => null });
        wsRef.current = ws;

        const unsub = ws.subscribe((msg) => {
          if (!msg) return;
          const type = msg.type || msg.event_type;
          const payload = msg.payload || msg;
          if (type === "transaction.created") {
            setTx((t) => [payload, ...t].slice(0, 50));
          } else if (type === "anomaly.created") {
            setAnoms((a) => [payload, ...a].slice(0, 50));
          } else if (type === "pump.heartbeat" || type === "pump.updated") {
            setPumps((prev) => {
              const idKey = payload.id ?? payload.pk ?? payload.pump_id;
              const idx = prev.findIndex((p) => String(p.id) === String(idKey));
              const pObj = normalizePump(payload);
              if (idx === -1) return [pObj, ...prev];
              const copy = prev.slice();
              copy[idx] = { ...copy[idx], ...pObj };
              return copy;
            });
          }
        });

        return () => {
          unsub && unsub();
          ws && ws.close && ws.close();
        };
      } catch (e) {
        console.error("OwnerDashboard load failed:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    const maybeCleanup = loadAll();

    return () => {
      mounted = false;
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
    };
  }, []);

  function buildWsUrl(stationId) {
    let origin =
      API_BASE ||
      (import.meta.env?.VITE_API_BASE ||
        import.meta.env?.VITE_API_URL ||
        "");
    if (!origin || typeof origin !== "string") {
      origin = window?.location?.origin || "http://localhost:8000";
    }
    origin = String(origin).replace(/\/+$/, "");
    if (/^https?:\/\//i.test(origin)) {
      origin = origin.replace(
        /^https?:/i,
        (m) => (m.toLowerCase().startsWith("https") ? "wss:" : "ws:")
      );
    } else {
      origin =
        (window.location?.protocol === "https:" ? "wss:" : "ws:") +
        "//" +
        origin;
    }
    return `${origin}/ws/stations/${stationId}/`;
  }

  function normalizePump(raw) {
    const id = raw.id || raw.pk || raw.uuid;
    const pump_number =
      raw.pump_number ?? raw.number ?? raw.pump_no ?? raw.pumpNo ?? null;
    const fuel_type =
      raw.fuel_type ??
      (raw.metadata && raw.metadata.fuel_type) ??
      raw.fuel ??
      "Unknown";
    const nozzle_id = raw.nozzle_id ?? raw.nozzle ?? null;
    const calibration_factor =
      raw.calibration_factor ?? raw.calibration ?? raw.cal ?? 1.0;
    const is_online =
      raw.is_online ??
      (typeof raw.status_label !== "undefined"
        ? raw.status_label === "online"
        : raw.status === "online");
    const status =
      raw.status_label ?? raw.status ?? (is_online ? "online" : "offline");
    const metadata = raw.metadata ?? {};
    return {
      ...raw,
      id,
      pump_number,
      fuel_type,
      nozzle_id,
      calibration_factor,
      is_online,
      status,
      metadata,
    };
  }

  async function acknowledgeAnomaly(id) {
    try {
      await api.post(`anomalies/${id}/acknowledge/`);
      setAnoms((prev) =>
        prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
      );
    } catch (e) {
      console.error("acknowledge failed", e);
      alert("Failed to acknowledge anomaly.");
    }
  }

  async function resolveAnomaly(id) {
    try {
      await api.post(`anomalies/${id}/resolve/`);
      setAnoms((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.error("resolve failed", e);
      alert("Failed to resolve anomaly.");
    }
  }

  async function openReceipt(txItem) {
    try {
      const r = await api.get(
        `receipts/?transaction=${encodeURIComponent(txItem.id)}`
      );
      const payload = r.data?.results || r.data || [];
      const pick = Array.isArray(payload) ? payload[0] : payload;
      setReceiptForTx({ tx: txItem, receipt: pick || null });
      setReceiptModalOpen(true);
    } catch (e) {
      try {
        const r2 = await api.get(
          `transactions/${encodeURIComponent(txItem.id)}/`
        );
        const txd = r2.data;
        setReceiptForTx({ tx: txItem, receipt: txd.receipt ?? null });
        setReceiptModalOpen(true);
      } catch (err) {
        console.error("failed fetching receipt", err);
        alert("No receipt found for this transaction.");
      }
    }
  }

  const salesData = useMemo(
    () => tx.map((t, i) => ({ idx: i + 1, value: Number(t.total_amount || 0) })),
    [tx]
  );

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="text-slate-500 animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* HERO */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-2xl font-extrabold shadow-lg"
            style={{
              background:
                "linear-gradient(135deg, rgba(16,185,129,1) 0%, rgba(6,78,201,1) 100%)",
            }}
          >
            FG
          </div>

          <div>
            <h1 className="text-2xl font-extrabold">Owner Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">
              Overview — pumps, recent sales and anomalies (live updates).
            </p>
            <div className="mt-1 text-xs text-slate-500">
              {station?.name ?? "No station configured"}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs text-slate-400">Last updated</div>
          <div className="text-sm font-medium">{new Date().toLocaleString()}</div>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Pumps" value={pumps.length} hint="Configured pumps" />
        <StatCard label="Recent sales" value={tx.length} hint="Last 20 transactions" />
        <StatCard label="Recent anomalies" value={anoms.length} hint="Last 20 anomalies" />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-2xl p-4 border shadow-lg" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(249,250,251,0.95))", borderColor: "rgba(2,6,23,0.04)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-lg">Pumps</h2>
              <div className="text-sm text-slate-500">{pumps.length} total</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {pumps.length === 0 ? (
                <div className="col-span-3 text-center text-slate-400 py-6">
                  No pumps configured yet.
                </div>
              ) : (
                pumps.map((p) => (
                  <PumpCard
                    key={p.id}
                    pump={p}
                    onClick={() =>
                      window.scrollTo({ top: 9999, behavior: "smooth" })
                    }
                  />
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl p-4 border shadow-lg min-h-[240px]" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(249,250,251,0.95))", borderColor: "rgba(2,6,23,0.04)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-lg">Sales (recent)</h2>
              <div className="text-sm text-slate-500">{tx.length} entries</div>
            </div>

            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={salesData}>
                  <XAxis dataKey="idx" stroke="#475569" />
                  <YAxis stroke="#475569" />
                  <Tooltip wrapperStyle={{ zIndex: 1000 }} contentStyle={{ background: "#fff", borderRadius: 8 }} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={chartStroke}
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl p-4 border shadow-md" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,247,250,0.98))", borderColor: "rgba(2,6,23,0.04)" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">Recent Transactions</h3>
              <div className="text-xs text-slate-500">Live</div>
            </div>

            <TransactionList items={tx} onViewReceipt={openReceipt} />
          </div>

          <div className="rounded-2xl p-4 border shadow-md" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,247,250,0.98))", borderColor: "rgba(2,6,23,0.04)" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">Recent Anomalies</h3>
              <div className="text-xs text-slate-500">Review</div>
            </div>

            <AnomalyList items={anoms} onAcknowledge={(id) => acknowledgeAnomaly(id)} onResolve={(id) => resolveAnomaly(id)} />
          </div>

          <div className="rounded-2xl p-4 border shadow-md" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,247,250,0.98))", borderColor: "rgba(2,6,23,0.04)" }}>
            <h3 className="text-base font-semibold mb-2">Rules</h3>
            <RulesManager stationId={station?.id} />
          </div>
        </aside>
      </div>

      <ReceiptModal
        open={receiptModalOpen}
        onClose={() => {
          setReceiptModalOpen(false);
          setReceiptForTx(null);
        }}
        receipt={receiptForTx?.receipt}
        transaction={receiptForTx?.tx}
      />
    </div>
  );
}

/* ---------- small presentational helpers (styling only) ---------- */

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl p-4 border shadow-sm" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,250,253,0.98))", borderColor: "rgba(2,6,23,0.04)" }}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-2">{hint}</div>}
    </div>
  );
}
