// src/pages/OwnerDashboard.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import createStationsWS from "../services/ws";

import PumpCard from "../components/PumpCard";
import TransactionList from "../components/TransactionList";
import AnomalyList from "../components/AnomalyList";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
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
 * OwnerDashboard (styling-only update)
 * - All API/WS logic is preserved exactly as before.
 * - Visuals: modern gradient background, glass cards, spacious layout, better typography.
 * - No new dependencies required.
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
          if (mounted) setPumps(pumpsData.results || pumpsData);
        } catch (e) {
          console.warn("Pumps fetch failed");
        }

        /** -------- Transactions -------- */
        try {
          const txData = await tryPaths(api, [
            `stations/${stationId}/transactions/?page_size=20`,
            `transactions/?station_id=${stationId}&page_size=20`,
          ]);
          if (mounted) setTransactions(txData.results || txData);
        } catch (e) {
          console.warn("Transactions fetch failed");
        }

        /** -------- Anomalies -------- */
        try {
          const anomData = await tryPaths(api, [
            `stations/${stationId}/anomalies/?page_size=20`,
            `anomalies/?station_id=${stationId}&page_size=20`,
          ]);
          if (mounted) setAnomalies(anomData.results || anomData);
        } catch (e) {
          console.warn("Anomalies fetch failed");
        }
      } catch (err) {
        console.error("Dashboard load failed:", err);
      }
    }

    loadDashboard();

    /** -------- WebSocket -------- */
    // Safe apiBase handling
    let wsBase =
      import.meta.env.VITE_API_WS ||
      (apiBase ? apiBase.replace(/\/api\/v\d+\/?$/, "") : null);
    if (!wsBase) wsBase = "http://localhost:8000";

    const wsUrl =
      (wsBase ? wsBase.replace(/\/+$/, "") : "http://localhost:8000") +
      "/ws/stations";

    // create WS
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

  /** -------- Chart data -------- */
  const salesData = transactions.map((t, i) => ({
    index: i + 1,
    amount: Number(t.total_amount || t.amount || 0),
  }));

  /* ------------------ Render (styling only) ------------------ */
  return (
    <div
      className="min-h-screen p-6"
      style={{
        background:
          "linear-gradient(135deg, #f5fbff 0%, #e6f4ff 25%, #eef2ff 50%, #f8f7ff 100%)",
      }}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* HERO */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-extrabold shadow-lg"
              style={{
                background: "linear-gradient(135deg,#1e90ff 0%, #7c3aed 100%)",
              }}
            >
              FG
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800">
                Owner Dashboard
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Live overview — pumps, sales and anomalies
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600">Real-time • Auto updates</div>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1 rounded-md bg-white shadow-sm border text-slate-800 hover:brightness-95 transition"
            >
              Refresh
            </button>
          </div>
        </header>

        {/* STATS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass">
            <div className="text-xs text-slate-500">Pumps</div>
            <div className="mt-2 text-2xl font-bold text-slate-800">
              {pumps.length}
            </div>
            <div className="text-xs text-slate-400 mt-1">Configured pumps</div>
          </div>

          <div className="glass">
            <div className="text-xs text-slate-500">Recent sales</div>
            <div className="mt-2 text-2xl font-bold text-slate-800">
              {transactions.length}
            </div>
            <div className="text-xs text-slate-400 mt-1">Last 20 transactions</div>
          </div>

          <div className="glass">
            <div className="text-xs text-slate-500">Anomalies</div>
            <div className="mt-2 text-2xl font-bold text-slate-800">
              {anomalies.length}
            </div>
            <div className="text-xs text-slate-400 mt-1">Recent alerts</div>
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: pumps + chart (span 2) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Pumps */}
            <div className="glass">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-800">Pumps</h3>
                <div className="text-sm text-slate-500">{pumps.length} total</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {pumps.length === 0 ? (
                  <div className="col-span-3 text-center py-6 text-slate-500">
                    No pumps configured.
                  </div>
                ) : (
                  pumps.map((p) => (
                    <PumpCard
                      key={p.id}
                      pump={p}
                      onClick={() => navigate(`/pump/${p.id}`)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Sales Chart */}
            <div className="glass">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-800">
                  Sales (last 20)
                </h3>
                <div className="text-sm text-slate-500">Amount (local)</div>
              </div>

              <div className="h-[260px]">
                <ResponsiveContainer>
                  <LineChart data={salesData}>
                    <XAxis dataKey="index" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      wrapperStyle={{ zIndex: 1000, boxShadow: "0 8px 20px rgba(16,24,40,0.08)" }}
                      contentStyle={{ borderRadius: 8 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke="#1e90ff"
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* RIGHT: transactions + anomalies */}
          <div className="space-y-4">
            <div className="glass">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-800">
                  Recent Transactions
                </h3>
                <div className="text-xs text-slate-500">Live</div>
              </div>

              <TransactionList
                items={transactions.map((t) => ({
                  id: t.id,
                  pump: t.pump?.pump_number,
                  volume: t.volume_l,
                  total_amount: t.total_amount,
                }))}
              />
            </div>

        
          </div>
        </div>
      </div>
    </div>
  );
}
