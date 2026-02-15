// src/pages/Anomalies.jsx
import React, { useEffect, useState, useMemo } from "react";
import api from "../services/api";
import { useAuth } from "../auth/AuthProvider";

/*
  Anomalies page — refreshed visual design.
  Styling only; all logic preserved.
*/

function formatDate(dt) {
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

function Badge({ children, tone = "info" }) {
  const map = {
    info: "bg-teal-50 text-teal-800",
    warn: "bg-amber-50 text-amber-800",
    danger: "bg-rose-50 text-rose-700",
    success: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-0.5 rounded-full text-xs font-semibold ${map[tone] || map.info} whitespace-nowrap`}
    >
      {children}
    </span>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex justify-between items-start text-sm">
      <div className="text-slate-700 dark:text-slate-200 font-medium">{label}</div>
      <div className="ml-4 text-right text-slate-500 dark:text-slate-300 break-words">{value}</div>
    </div>
  );
}

/* -------------------
   New helper: pretty render for tank_mismatch details
   ------------------- */
function TankMismatchView({ details }) {
  // details expected shape from reconcile: expected_level, actual_level, total_dispensed, t0, t1, delta_l, delta_percent
  if (!details) return null;
  const expected = details.expected_level ?? details.expected_level_l ?? details.expected ?? null;
  const actual = details.actual_level ?? details.actual ?? null;
  const total_dispensed = details.total_dispensed ?? details.S ?? details.total ?? "—";
  const delta_l = details.delta_l ?? details.delta ?? "—";
  const delta_percent = details.delta_percent ?? details.delta_pct ?? "—";
  const t0 = details.t0 || {};
  const t1 = details.t1 || {};

  // Normalize values for display
  const fmt = (v) => (v == null ? "—" : String(v));
  const posNeg = (() => {
    try {
      const d = parseFloat(String(delta_l));
      if (Number.isNaN(d)) return fmt(delta_l);
      return d > 0 ? `${d} L (lower than expected)` : `${d} L (${Math.abs(d)} L higher than expected)`;
    } catch {
      return fmt(delta_l);
    }
  })();

  return (
    <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
      <div className="bg-white/60 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Tank mismatch summary</div>
            <div className="text-xs text-slate-500 mt-1">Auto-calculated from tank readings and recorded sales</div>
          </div>
          <div className="text-right text-xs text-slate-500">
            Flagged: <span className="font-semibold text-rose-600">{details.flagged ? "Yes" : "No"}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
          <div className="space-y-1">
            <MetaRow label="Tank" value={fmt(details.tank_id || details.tank)} />
            <MetaRow label="T0 reading" value={`${(t0.reading_id || "").slice(0,8)} • ${formatDate(t0.measured_at) || "—"}`} />
            <MetaRow label="T0 level" value={`${fmt(t0.level ?? t0.level_l ?? "")} L`} />
            <MetaRow label="Sales between reads" value={`${fmt(total_dispensed)} L`} />
          </div>

          <div className="space-y-1">
            <MetaRow label="T1 reading" value={`${(t1.reading_id || "").slice(0,8)} • ${formatDate(t1.measured_at) || "—"}`} />
            <MetaRow label="T1 level" value={`${fmt(actual)} L`} />
            <MetaRow label="Expected level" value={`${fmt(expected)} L`} />
            <MetaRow label="Difference" value={`${fmt(delta_l)} L • ${fmt(delta_percent)}%`} />
          </div>
        </div>

        <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          <div className="font-medium mb-1">Plain language explanation</div>
          <div>
            Based on the earlier reading (T0) and the reported sales, the tank should be at <strong>{fmt(expected)} L</strong>.
            The tank's sensor reports <strong>{fmt(actual)} L</strong>, a difference of <strong>{fmt(delta_l)} L</strong>.
            This indicates the tank is <strong>{Math.sign(Number(delta_l || 0)) < 0 ? `${Math.abs(Number(delta_l))} L higher than expected` : `${Math.abs(Number(delta_l))} L lower than expected`}</strong>.
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="text-xs text-slate-500">
            <div className="font-semibold mb-1">Likely causes</div>
            <ul className="list-disc ml-4">
              <li>Sensor reading error / calibration issue</li>
              <li>Manual refill or transfer not recorded</li>
              <li>Transactions missing or mis-attributed</li>
            </ul>
          </div>

          <div className="text-xs text-slate-500">
            <div className="font-semibold mb-1">Suggested actions</div>
            <ol className="list-decimal ml-4">
              <li>Check tank reading history and operator notes.</li>
              <li>Verify recent deliveries / manual fills.</li>
              <li>Confirm transactions are assigned to correct pump & station.</li>
              <li>Acknowledge and escalate if the discrepancy persists.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Compact quick facts row */}
      <div className="flex gap-3 text-xs">
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded shadow-inner">
          <div className="text-slate-500">Delta</div>
          <div className="font-semibold">{fmt(delta_l)} L</div>
        </div>
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded shadow-inner">
          <div className="text-slate-500">Delta %</div>
          <div className="font-semibold">{fmt(delta_percent)}%</div>
        </div>
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded shadow-inner">
          <div className="text-slate-500">Flagged</div>
          <div className="font-semibold">{details.flagged ? "Yes" : "No"}</div>
        </div>
      </div>
    </div>
  );
}

/* End of TankMismatchView helper */

export default function Anomalies() {
  const { user } = useAuth();
  const [station, setStation] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [tanks, setTanks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyMap, setBusyMap] = useState({});
  const [message, setMessage] = useState(null);
  const [detailsModal, setDetailsModal] = useState({ open: false, anomaly: null });

  // dark mode state (persisted)
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("fg-dark");
      if (saved === null) return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      return saved === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (dark) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("fg-dark", "1");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("fg-dark", "0");
      }
    } catch {}
  }, [dark]);

  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      setLoading(true);
      setMessage(null);
      try {
        const stRes = await api.get("stations/");
        const st = stRes.data?.results?.[0] || (Array.isArray(stRes.data) ? stRes.data[0] : stRes.data);
        if (!st) {
          if (mounted) setMessage({ type: "warn", text: "No station found for this user." });
          setLoading(false);
          return;
        }
        if (!mounted) return;
        setStation(st);

        const [anRes, tankRes] = await Promise.allSettled([
          api.get(`anomalies/?station=${encodeURIComponent(st.id)}&page_size=50`),
          api.get(`tanks/?station=${encodeURIComponent(st.id)}`),
        ]);

        if (anRes.status === "fulfilled") {
          const items = Array.isArray(anRes.value.data) ? anRes.value.data : (anRes.value.data?.results || []);
          if (mounted) setAnomalies(items);
        } else {
          console.warn("Failed fetch anomalies:", anRes.reason);
          if (mounted) setMessage({ type: "error", text: "Failed to load anomalies." });
        }

        if (tankRes.status === "fulfilled") {
          const tlist = Array.isArray(tankRes.value.data) ? tankRes.value.data : (tankRes.value.data?.results || []);
          if (mounted) setTanks(tlist);
        }
      } catch (e) {
        console.error("Anomalies load failed:", e);
        if (mounted) setMessage({ type: "error", text: "Failed to load page data." });
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadAll();
    return () => { mounted = false; };
  }, []);

  const setBusyFor = (id, v) => setBusyMap((m) => ({ ...m, [id]: !!v }));

  async function acknowledgeAnomaly(an) {
    if (!an?.id) return;
    const id = an.id;
    setBusyFor(id, true);
    setMessage(null);
    setAnomalies((prev) => prev.map((p) => (p.id === id ? { ...p, acknowledged: true } : p)));
    try {
      await api.post(`anomalies/${id}/acknowledge/`);
      setMessage({ type: "success", text: "Anomaly acknowledged." });
    } catch (e) {
      setAnomalies((prev) => prev.map((p) => (p.id === id ? { ...p, acknowledged: an.acknowledged } : p)));
      console.error("ack fail", e);
      setMessage({ type: "error", text: "Acknowledge failed." });
    } finally {
      setBusyFor(id, false);
    }
  }

  async function resolveAnomaly(an) {
    if (!an?.id) return;
    const id = an.id;
    setBusyFor(id, true);
    setMessage(null);
    setAnomalies((prev) => prev.map((p) => (p.id === id ? { ...p, resolved: true } : p)));
    try {
      await api.post(`anomalies/${id}/resolve/`);
      setMessage({ type: "success", text: "Anomaly resolved." });
    } catch (e) {
      setAnomalies((prev) => prev.map((p) => (p.id === id ? { ...p, resolved: an.resolved } : p)));
      console.error("resolve fail", e);
      setMessage({ type: "error", text: "Resolve failed." });
    } finally {
      setBusyFor(id, false);
    }
  }

  async function refresh() {
    if (!station) return;
    setLoading(true);
    setMessage(null);
    try {
      const [anRes, tankRes] = await Promise.allSettled([
        api.get(`anomalies/?station=${encodeURIComponent(station.id)}&page_size=50`),
        api.get(`tanks/?station=${encodeURIComponent(station.id)}`),
      ]);
      if (anRes.status === "fulfilled") {
        const list = Array.isArray(anRes.value.data) ? anRes.value.data : (anRes.value.data?.results || []);
        setAnomalies(list);
      }
      if (tankRes.status === "fulfilled") {
        const tlist = Array.isArray(tankRes.value.data) ? tankRes.value.data : (tankRes.value.data?.results || []);
        setTanks(tlist);
      }
      setMessage({ type: "success", text: "Refreshed." });
    } catch (e) {
      console.error("refresh error", e);
      setMessage({ type: "error", text: "Refresh failed." });
    } finally {
      setLoading(false);
    }
  }

  function clearLocalList() {
    setAnomalies([]);
    setMessage({ type: "info", text: "Local anomaly list cleared. Use Refresh to re-load from server." });
  }

  async function reconcileTank(tank) {
    if (!tank?.id) return;
    setBusyFor(`tank-${tank.id}`, true);
    setMessage(null);
    try {
      const res = await api.post(`tanks/${tank.id}/reconcile/`);
      setMessage({ type: "success", text: res.data?.message || "Reconcile scheduled." });
    } catch (e) {
      console.error("reconcile error", e);
      setMessage({ type: "error", text: "Failed to request reconcile." });
    } finally {
      setBusyFor(`tank-${tank.id}`, false);
    }
  }

  const counts = useMemo(() => {
    return {
      total: anomalies.length,
      unresolved: anomalies.filter((a) => !a.resolved).length,
      unack: anomalies.filter((a) => !a.acknowledged).length,
    };
  }, [anomalies]);

  function severityAccent(sev) {
    const s = (sev || "info").toLowerCase();
    if (s === "critical" || s === "danger") return { strip: "bg-rose-400/60", tone: "danger" };
    if (s === "warning" || s === "warn") return { strip: "bg-amber-400/60", tone: "warn" };
    return { strip: "bg-teal-400/60", tone: "info" };
  }

  return (
    <div className={`min-h-screen py-10 transition-colors duration-300 ${dark ? "bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-slate-200" : "bg-gradient-to-br from-sky-50 via-white to-indigo-50 text-slate-800"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div aria-hidden className="w-16 h-16 rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 flex items-center justify-center shadow-2xl text-white text-2xl font-extrabold">
              FG
            </div>

            <div>
              <h1 className="text-3xl font-extrabold leading-tight">Anomalies</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Monitor, inspect and resolve station anomalies — fast and friendly.</p>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Signed in as <span className="font-medium">{user?.username ?? "—"}</span></div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              aria-pressed={dark}
              onClick={() => setDark((v) => !v)}
              title="Toggle dark mode"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/90 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 shadow-sm hover:scale-[1.02] transition transform"
            >
              {dark ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 4.5a.75.75 0 01.75.75V7a.75.75 0 01-1.5 0V5.25A.75.75 0 0110 4.5zM10 12.75a2.75 2.75 0 100-5.5 2.75 2.75 0 000 5.5zM4.5 10a.75.75 0 01.75-.75H7a.75.75 0 010 1.5H5.25A.75.75 0 014.5 10zM13 10a.75.75 0 01.75-.75H15a.75.75 0 010 1.5h-1.25A.75.75 0 0113 10zM6.28 6.28a.75.75 0 011.06 0l.88.88a.75.75 0 11-1.06 1.06l-.88-.88a.75.75 0 010-1.06zM12.78 12.78a.75.75 0 011.06 0l.88.88a.75.75 0 11-1.06 1.06l-.88-.88a.75.75 0 010-1.06zM6.28 13.72a.75.75 0 010-1.06l.88-.88a.75.75 0 111.06 1.06l-.88.88a.75.75 0 01-1.06 0zM12.78 7.22a.75.75 0 010-1.06l.88-.88a.75.75 0 111.06 1.06l-.88.88a.75.75 0 01-1.06 0z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.293 13.293a8 8 0 01-10.586-10.586A7 7 0 1017.293 13.293z" />
                </svg>
              )}
              <span className="text-sm hidden sm:inline">{dark ? "Dark" : "Light"}</span>
            </button>

            <button
              onClick={refresh}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 text-sm font-semibold transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-600 dark:text-slate-200" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 8a6 6 0 1111.03 3.477l1.2 1.2A8 8 0 10 4 8z" clipRule="evenodd" />
              </svg>
              <span>{loading ? "Refreshing..." : "Refresh"}</span>
            </button>

            <button onClick={clearLocalList} className="px-3 py-2 rounded-lg bg-transparent text-sm text-slate-600 dark:text-slate-300 hover:underline">
              Clear
            </button>
          </div>
        </header>

        {message && (
          <div className={`mb-6 p-4 rounded-lg shadow-sm ${message.type === "error" ? "bg-rose-50 text-rose-700" : (message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main list */}
          <section className="md:col-span-2">
            <div className="bg-white/70 dark:bg-slate-800/60 backdrop-blur rounded-2xl p-5 border border-slate-100 dark:border-slate-700 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Active anomalies</h2>

                <div className="text-sm text-slate-500 dark:text-slate-300">
                  <div>Total: <span className="font-semibold text-slate-700 dark:text-slate-100">{counts.total}</span></div>
                  <div className="text-xs text-slate-400 dark:text-slate-300">Unack: {counts.unack} • Unresolved: {counts.unresolved}</div>
                </div>
              </div>

              <div className="space-y-4 max-h-[64vh] overflow-auto pr-2">
                {anomalies.length === 0 && (
                  <div className="py-12 text-center text-slate-500 dark:text-slate-300">No anomalies found — everything looks calm ✨</div>
                )}

                {anomalies.map((an) => {
                  const { strip, tone } = severityAccent(an.severity);
                  const detailSummary = (() => {
                    if (an.details && typeof an.details === "object") {
                      if (an.details.reason) return String(an.details.reason);
                      const keys = Object.keys(an.details);
                      if (keys.length) return `${keys[0]}: ${String(an.details[keys[0]])}`;
                    }
                    return String(an.details || "");
                  })();

                  return (
                    <article key={an.id} className="relative rounded-xl border dark:border-slate-700 p-4 shadow-sm hover:shadow-md transition flex gap-4 items-start bg-white dark:bg-slate-800">
                      {/* severity strip */}
                      <div className={`${strip} w-1 h-full rounded-l-xl`} aria-hidden />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-3">
                              <Badge tone={tone}>{(an.severity || "info").toUpperCase()}</Badge>

                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{an.name || (an.rule || "Anomaly").replace(/_/g, " ")}</div>
                                <div className="text-xs text-slate-400 dark:text-slate-300">{formatDate(an.created_at)}</div>
                              </div>
                            </div>

                            <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                              <div className="text-xs text-slate-400 dark:text-slate-400">Rule: <span className="font-medium text-slate-700 dark:text-slate-200">{an.rule ?? "—"}</span></div>
                              <div className="mt-1 text-sm">{detailSummary}</div>
                              <div className="mt-2 text-xs text-slate-400 dark:text-slate-400">Score: <span className="font-semibold text-slate-700 dark:text-slate-200">{typeof an.score === "number" ? an.score : "—"}</span></div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <div className="text-xs text-slate-400 dark:text-slate-400">{an.pump ? `Pump: ${an.pump}` : ""}</div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => setDetailsModal({ open: true, anomaly: an })}
                                className="inline-flex items-center gap-2 px-2 py-1 text-sm rounded-md border hover:bg-slate-50 dark:hover:bg-slate-700/40"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-600 dark:text-slate-200" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a8 8 0 1116 0A8 8 0 012 10zm8-4a4 4 0 100 8 4 4 0 000-8z"/></svg>
                                View
                              </button>

                              <button
                                onClick={() => acknowledgeAnomaly(an)}
                                disabled={busyMap[an.id] || an.acknowledged}
                                className={`px-3 py-1 rounded-md text-sm font-medium transition ${an.acknowledged ? 'bg-emerald-50 text-emerald-700 border' : 'bg-white dark:bg-slate-700 border dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/60'}`}
                              >
                                {busyMap[an.id] ? "Working..." : (an.acknowledged ? "Acknowledged" : "Acknowledge")}
                              </button>

                              <button
                                onClick={() => resolveAnomaly(an)}
                                disabled={busyMap[an.id] || an.resolved}
                                className={`px-3 py-1 rounded-md text-sm font-medium transition ${an.resolved ? 'bg-slate-50 text-slate-600 border' : 'bg-white dark:bg-slate-700 border dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/60'}`}
                              >
                                {busyMap[an.id] ? "Working..." : (an.resolved ? "Resolved" : "Resolve")}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Sidebar */}
          <aside className="space-y-6">
            <div className="bg-white/70 dark:bg-slate-800/60 backdrop-blur rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-md">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Station</h3>
                <Badge tone="info">{station?.code ?? "—"}</Badge>
              </div>

              <div className="mt-4 space-y-2">
                <MetaRow label="Name" value={station?.name ?? "—"} />
                <MetaRow label="Owner" value={station?.owner?.username ?? "—"} />
                <MetaRow label="Timezone" value={station?.timezone ?? "UTC"} />
              </div>
            </div>

            <div className="bg-white/70 dark:bg-slate-800/60 backdrop-blur rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-md">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Tanks</h3>
                <button onClick={() => refresh()} className="text-sm text-slate-500 dark:text-slate-300 hover:underline">Refresh</button>
              </div>

              <div className="mt-3 space-y-3">
                {tanks.length === 0 && <div className="text-sm text-slate-500 dark:text-slate-300">No tanks found.</div>}

                {tanks.map((t) => (
                  <div key={t.id} className="rounded-lg p-3 bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{`Tank ${String(t.id).slice(0,8)}`}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-300">Fuel: {t.fuel_type ?? "—"}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-300 mt-1">Capacity: {Number(t.capacity_l ?? 0).toLocaleString()} L</div>
                        <div className="text-xs text-slate-500 dark:text-slate-300">Level: {Number(t.current_level_l ?? 0).toLocaleString()} L</div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <button
                          onClick={() => reconcileTank(t)}
                          disabled={busyMap[`tank-${t.id}`]}
                          className="px-3 py-1 rounded-md text-sm border bg-white dark:bg-slate-700 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                        >
                          {busyMap[`tank-${t.id}`] ? "Scheduling..." : "Reconcile"}
                        </button>
                        <div className="text-xs text-slate-400 dark:text-slate-300">{t.last_read_at ? formatDate(t.last_read_at) : "No recent read"}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/70 dark:bg-slate-800/60 backdrop-blur rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-md">
              <h3 className="text-base font-semibold">Quick help</h3>
              <ol className="list-decimal list-inside text-sm mt-2 space-y-1 text-slate-600 dark:text-slate-300">
                <li>Review anomalies (use View for details)</li>
                <li>Acknowledge those you investigate</li>
                <li>Resolve after fix or escalate</li>
                <li>Use Reconcile to compare tank reads vs sales</li>
              </ol>
            </div>
          </aside>
        </div>

        {/* DETAILS MODAL */}
        {detailsModal.open && detailsModal.anomaly && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDetailsModal({ open: false, anomaly: null })} />
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 z-10 overflow-auto max-h-[80vh]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Anomaly details</h3>
                <button onClick={() => setDetailsModal({ open: false, anomaly: null })} className="text-slate-500 dark:text-slate-300 hover:text-slate-800 text-2xl leading-none">×</button>
              </div>

              <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                <MetaRow label="Name" value={detailsModal.anomaly.name || detailsModal.anomaly.rule} />
                <MetaRow label="Severity" value={detailsModal.anomaly.severity} />
                <MetaRow label="Score" value={String(detailsModal.anomaly.score ?? "—")} />
                <MetaRow label="Created at" value={formatDate(detailsModal.anomaly.created_at)} />
                {detailsModal.anomaly.transaction && <MetaRow label="Transaction" value={String(detailsModal.anomaly.transaction).slice(0,8)} />}
                {detailsModal.anomaly.pump && <MetaRow label="Pump" value={String(detailsModal.anomaly.pump).slice(0,8)} />}
              </div>

              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Details</h4>

                {/* If anomaly looks like tank_mismatch, render friendly view */}
                {detailsModal.anomaly.details && (detailsModal.anomaly.rule === "tank_mismatch" ||
                  (detailsModal.anomaly.details.expected_level && detailsModal.anomaly.details.actual_level)) ? (
                  <TankMismatchView details={detailsModal.anomaly.details} />
                ) : (
                  <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded">
                    <pre className="text-xs overflow-auto whitespace-pre-wrap">{JSON.stringify(detailsModal.anomaly.details || {}, null, 2)}</pre>
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button onClick={() => { acknowledgeAnomaly(detailsModal.anomaly); }} className="px-4 py-2 bg-amber-600 text-white rounded-lg shadow">Acknowledge</button>
                <button onClick={() => { resolveAnomaly(detailsModal.anomaly); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg shadow">Resolve</button>
                <button onClick={() => setDetailsModal({ open: false, anomaly: null })} className="px-4 py-2 border rounded-lg">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
