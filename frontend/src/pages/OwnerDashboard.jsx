import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import createStationsWS from "../services/ws";

import PumpCard from "../components/PumpCard";
import TransactionList from "../components/TransactionList";
import AnomalyList from "../components/AnomalyList";

import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

/**
 * Try multiple API paths sequentially (logic unchanged)
 */
function tryPaths(api, paths) {
  return paths.reduce(
    (p, path) =>
      p.catch(() => api.get(path).then((res) => res.data)),
    Promise.reject()
  );
}

/**
 * OwnerDashboard — beautified
 * - Big focus on visual polish: gradients, glass, micro-interactions and smooth entrance animations
 * - Uses framer-motion for pleasant animated entrance & hover lifts
 * - Keeps pump ids private while showing friendly labels
 */
export default function OwnerDashboard() {
  const navigate = useNavigate();
  const { api, apiBase, getAccessToken } = useAuth();

  const [pumps, setPumps] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [anomalies, setAnomalies] = useState([]);

  const wsRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        /** -------- Station -------- */
        const stationRes = await api.get("stations/");
        const station =
          (Array.isArray(stationRes.data) && stationRes.data[0]) ||
          stationRes.data?.results?.[0];

        if (!station?.id) return;
        const stationId = station.id;

        /** -------- Pumps -------- */
        try {
          const pumpsData = await tryPaths(api, [
            `stations/${stationId}/pumps/`,
            `pumps/?station_id=${stationId}`,
            `pumps/?station=${stationId}`,
          ]);
          if (mounted) setPumps(pumpsData.results || pumpsData || []);
        } catch (e) {
          console.warn("Pumps fetch failed", e);
        }

        /** -------- Transactions -------- */
        try {
          const txData = await tryPaths(api, [
            `stations/${stationId}/transactions/?page_size=20`,
            `transactions/?station_id=${stationId}&page_size=20`,
          ]);
          if (mounted) setTransactions(txData.results || txData || []);
        } catch (e) {
          console.warn("Transactions fetch failed", e);
        }

        /** -------- Anomalies -------- */
        try {
          const anomData = await tryPaths(api, [
            `stations/${stationId}/anomalies/?page_size=20`,
            `anomalies/?station_id=${stationId}&page_size=20`,
          ]);
          if (mounted) setAnomalies(anomData.results || anomData || []);
        } catch (e) {
          console.warn("Anomalies fetch failed", e);
        }
      } catch (err) {
        console.error("Dashboard load failed:", err);
      }
    }

    loadDashboard();

    /** -------- WebSocket -------- */
    let wsBase =
      import.meta.env.VITE_API_WS ||
      (apiBase ? apiBase.replace(/\/api\/v\d+\/?$/, "") : null);
    if (!wsBase) wsBase = "http://localhost:8000";

    const wsUrl =
      (wsBase ? wsBase.replace(/\/+$/, "") : "http://localhost:8000") +
      "/ws/stations";

    wsRef.current = createStationsWS(wsUrl, {
      getToken: getAccessToken,
    });

    const unsubscribe = wsRef.current.subscribe((msg) => {
      if (!msg || msg.__meta) return;

      const type = msg.type || msg.event_type;
      const payload = msg.payload || msg;

      if (type === "transaction.created") {
        setTransactions((prev) => [payload, ...prev].slice(0, 20));
      }

      if (type === "anomaly.created") {
        setAnomalies((prev) => [payload, ...prev].slice(0, 20));
      }
    });

    return () => {
      mounted = false;
      unsubscribe?.();
      wsRef.current?.close();
    };
  }, [api, apiBase, getAccessToken, navigate]);

  /** -------- Helper: pumps map & label derivation -------- */
  const pumpsMap = React.useMemo(() => {
    const m = new Map();
    for (const p of pumps || []) {
      const id = p.id;
      const label =
        p.pump_number !== undefined && p.pump_number !== null
          ? `Pump ${p.pump_number}`
          : p.nozzle_id
          ? `${p.nozzle_id}`
          : p.fuel_type
          ? `${p.fuel_type} pump`
          : String(id).slice(0, 8);
      m.set(id, { label, raw: p });
    }
    return m;
  }, [pumps]);

  function derivePumpLabel(pumpObj) {
    if (!pumpObj) return undefined;

    const id = pumpObj?.id ?? (typeof pumpObj === "string" ? pumpObj : undefined);

    if (id && pumpsMap.has(id)) return pumpsMap.get(id).label;

    if (typeof pumpObj === "object") {
      if (pumpObj.pump_number !== undefined && pumpObj.pump_number !== null)
        return `Pump ${pumpObj.pump_number}`;
      if (pumpObj.nozzle_id) return String(pumpObj.nozzle_id);
      if (pumpObj.fuel_type && pumpObj.nozzle_id)
        return `${pumpObj.fuel_type} ${pumpObj.nozzle_id}`;
      if (pumpObj.fuel_type) return `${pumpObj.fuel_type} pump`;
    }

    if (id) return String(id).slice(0, 8);

    return undefined;
  }

  /** -------- Chart data -------- */
  const salesData = transactions.map((t, i) => ({
    index: i + 1,
    amount: Number(t.total_amount || t.amount || 0),
  }));

  /**
   * Build per-pump summary from transactions
   */
  const pumpSummary = React.useMemo(() => {
    const map = new Map();

    for (const t of transactions || []) {
      const pumpObj = t.pump ?? null;
      if (!pumpObj) continue;

      const pumpId = pumpObj?.id ?? (typeof pumpObj === "string" ? pumpObj : String(pumpObj));
      const label = derivePumpLabel(pumpObj) || (pumpId ? String(pumpId).slice(0, 8) : "Unknown");

      const vol = Number(t.volume_l || t.volume || 0);
      const amt = Number(t.total_amount || t.amount || 0);

      if (!map.has(pumpId)) {
        map.set(pumpId, {
          pumpId,
          pumpLabel: label,
          liters: 0,
          sales: 0,
          txCount: 0,
        });
      }
      const entry = map.get(pumpId);
      entry.liters += isNaN(vol) ? 0 : vol;
      entry.sales += isNaN(amt) ? 0 : amt;
      entry.txCount += 1;
    }

    return Array.from(map.values()).sort((a, b) => (a.pumpLabel > b.pumpLabel ? 1 : -1));
  }, [transactions, pumpsMap]);

  const totals = React.useMemo(() => {
    return pumpSummary.reduce(
      (acc, p) => {
        acc.liters += p.liters;
        acc.sales += p.sales;
        acc.tx += p.txCount;
        return acc;
      },
      { liters: 0, sales: 0, tx: 0 }
    );
  }, [pumpSummary]);

  /* ------------------ small helpers for animation ------------------ */
  const cardVariants = {
    hidden: { opacity: 0, y: 8 },
    enter: { opacity: 1, y: 0 },
    hover: { scale: 1.02 },
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#f0f9ff] via-[#f8f2ff] to-[#fff7f0] p-8">
      {/* decorative blobs */}
      <svg className="pointer-events-none absolute -right-32 -top-16 opacity-30 animate-pulse-slow" width="520" height="520" viewBox="0 0 520 520" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle cx="260" cy="260" r="200" fill="url(#g1)" />
      </svg>

      <div className="relative max-w-7xl mx-auto space-y-6">
        <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-extrabold shadow-2xl" style={{ background: "linear-gradient(135deg,#06b6d4 0%, #7c3aed 100%)" }}>
              FG
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 leading-tight">Owner Dashboard</h1>
              <p className="text-sm text-slate-600 mt-1">A beautiful realtime view — pumps, sales and alerts</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600 hidden sm:block">Real-time • Auto updates</div>
            <button onClick={() => window.location.reload()} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-md border border-slate-100 text-slate-900 hover:scale-105 transform transition">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6" /></svg>
              Refresh
            </button>
          </div>
        </motion.header>

        {/* STATS */}
        <motion.div initial="hidden" animate="enter" className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <motion.div variants={cardVariants} whileHover="hover" className="rounded-xl p-5 bg-white/70 backdrop-blur-md border border-white/30 shadow-md overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-indigo-600 font-semibold">Pumps</div>
                <div className="mt-2 text-3xl font-extrabold text-slate-900">{pumps.length}</div>
                <div className="text-xs text-slate-500 mt-1">Configured pumps</div>
              </div>
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600 font-semibold shadow-sm">⛽</div>
              </div>
            </div>
          </motion.div>

          <motion.div variants={cardVariants} whileHover="hover" className="rounded-xl p-5 bg-white/70 backdrop-blur-md border border-white/30 shadow-md overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-emerald-600 font-semibold">Recent sales</div>
                <div className="mt-2 text-3xl font-extrabold text-slate-900">{transactions.length}</div>
                <div className="text-xs text-slate-500 mt-1">Last 20 transactions</div>
              </div>
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600 font-semibold shadow-sm">💸</div>
              </div>
            </div>
          </motion.div>

          <motion.div variants={cardVariants} whileHover="hover" className="rounded-xl p-5 bg-white/70 backdrop-blur-md border border-white/30 shadow-md overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-rose-600 font-semibold">Anomalies</div>
                <div className="mt-2 text-3xl font-extrabold text-slate-900">{anomalies.length}</div>
                <div className="text-xs text-slate-500 mt-1">Recent alerts</div>
              </div>
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-rose-50 text-rose-600 font-semibold shadow-sm">⚠️</div>
              </div>
            </div>
          </motion.div>

          <motion.div variants={cardVariants} whileHover="hover" className="rounded-xl p-5 bg-white/70 backdrop-blur-md border border-white/30 shadow-md overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-sky-600 font-semibold">Sales (total shown)</div>
                <div className="mt-2 text-3xl font-extrabold text-slate-900">{Number(totals.sales || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                <div className="text-xs text-slate-500 mt-1">Sum across pumps (current page)</div>
              </div>
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-sky-50 text-sky-600 font-semibold shadow-sm">📈</div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: pumps + chart (span 2) */}
          <div className="lg:col-span-2 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-xl p-6 bg-white/75 backdrop-blur-md border border-white/30 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-slate-900">Per-pump summary</h3>
                <div className="text-sm text-slate-500">Litres • Sales • Tx count</div>
              </div>

              {pumpSummary.length === 0 ? (
                <div className="text-center py-16 text-slate-500">No pump sales data yet.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pumpSummary.map((p, idx) => (
                    <motion.div key={p.pumpId} whileHover={{ scale: 1.02 }} transition={{ type: "spring", stiffness: 250 }} className="flex items-center justify-between p-4 rounded-lg bg-white shadow-sm border">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{p.pumpLabel}</div>
                        <div className="text-xs text-slate-500">{p.txCount} tx</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">L</div>
                        <div className="text-lg font-semibold text-slate-900">{Number(p.liters || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</div>
                        <div className="mt-2 text-xs text-slate-500">Sales</div>
                        <div className="font-semibold">{Number(p.sales || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="rounded-xl p-6 bg-white/80 backdrop-blur-md border border-white/30 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-slate-900">Pumps</h3>
                <div className="text-sm text-slate-500">{pumps.length} total</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {pumps.length === 0 ? (
                  <div className="col-span-3 text-center py-8 text-slate-500">No pumps configured.</div>
                ) : (
                  pumps.map((p) => (
                    <PumpCard
                      key={p.id}
                      pump={p}
                      pumpLabel={pumpsMap.get(p.id)?.label || derivePumpLabel(p)}
                      onClick={() => navigate(`/pump/${p.id}`)}
                    />
                  ))
                )}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="rounded-xl p-6 bg-white/80 backdrop-blur-md border border-white/30 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-slate-900">Sales (last 20)</h3>
                <div className="text-sm text-slate-500">Amount (local)</div>
              </div>

              <div className="h-[300px]">
                <ResponsiveContainer>
                  <AreaChart data={salesData}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>

                    <XAxis dataKey="index" tick={{ fill: '#64748b' }} axisLine={false} />
                    <YAxis tick={{ fill: '#64748b' }} axisLine={false} />
                    <Tooltip wrapperStyle={{ zIndex: 1000, boxShadow: "0 12px 40px rgba(16,24,40,0.12)", borderRadius: 12 }} />

                    <Area type="monotone" dataKey="amount" stroke="url(#lineGrad)" strokeWidth={3} fillOpacity={1} fill="url(#areaGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>

          {/* RIGHT: transactions + anomalies */}
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-xl p-4 bg-white/80 backdrop-blur-md border border-white/30 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-900">Recent Transactions</h3>
                <div className="text-xs text-slate-500">Live</div>
              </div>

              <TransactionList
                items={transactions
                  .filter((t) => !!t.pump)
                  .map((t) => ({
                    id: t.id,
                    pump: derivePumpLabel(t.pump) || (typeof t.pump === "string" ? String(t.pump).slice(0, 8) : "Unknown"),
                    volume: t.volume_l,
                    total_amount: t.total_amount,
                    timestamp: t.timestamp || t.created_at,
                  }))}
              />
            </motion.div>

            
          </div>
        </div>

        <style jsx>{`\n          /* small custom animation speed for background blob */\n          @keyframes pulse-slow {\n            0% { transform: scale(1); }\n            50% { transform: scale(1.08); }\n            100% { transform: scale(1); }\n          }\n          .animate-pulse-slow { animation: pulse-slow 8s ease-in-out infinite; }\n        `}</style>
      </div>
    </div>
  );
}
