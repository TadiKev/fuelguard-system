// src/pages/AttendantPOS.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import api from "../services/api";
import PumpCard from "../components/PumpCard";
import TxWithReceiptButtons from "../components/TxWithReceiptButtons";
import ReceiptModal from "../components/ReceiptModal";
import { useAuth } from "../auth/AuthProvider";
import RunReconcileButton from "../components/RunReconcileButton";
import ReconcileButton from "../components/ReconcileButton";

/**
 * Attendant POS — shows a clear station reconcile button in the header
 * and a tank reconcile button in the Selected Pump panel (when pump has tank_id).
 *
 * Updated:
 *  - Recent Anomalies render a readable interpretation for tank_mismatch
 *  - Pagination: "Load more anomalies" button to fetch older pages
 *  - Toggle to view raw JSON for each anomaly
 */

export default function AttendantPOS() {
  const { user, ready } = useAuth();
  const [station, setStation] = useState(null);
  const [pumps, setPumps] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // anomalies: array of items; anomaliesNext: next page URL (or null)
  const [anomalies, setAnomalies] = useState([]);
  const [anomaliesNext, setAnomaliesNext] = useState(null);
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);

  const [selectedPump, setSelectedPump] = useState(null);

  const [mode, setMode] = useState("liters");
  const [liters, setLiters] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [currentReceiptToken, setCurrentReceiptToken] = useState(null);
  const [currentTxForReceipt, setCurrentTxForReceipt] = useState(null);

  // dark mode (persisted)
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

  if (ready && !user) return <Navigate to="/login" replace />;

  // helper: detect tank_mismatch-like details
  function isTankMismatch(an) {
    const d = an?.details || {};
    return an?.rule === "tank_mismatch" || (d && (d.expected_level || d.actual_level || d.expected || d.delta_l));
  }

  // friendly summary renderer for tank mismatch (small, compact)
  function TankMismatchSummary({ details }) {
    const d = details || {};
    const t0 = d.t0 || {};
    const t1 = d.t1 || {};
    const expected = d.expected_level ?? d.expected ?? "—";
    const actual = d.actual_level ?? d.actual ?? "—";
    const total_dispensed = d.total_dispensed ?? d.S ?? d.total_dispensed_l ?? "—";
    const delta = d.delta_l ?? d.delta ?? (expected !== "—" && actual !== "—" ? (parseFloat(expected) - parseFloat(actual)).toString() : "—");
    const pct = d.delta_percent ?? d.delta_pct ?? "—";

    return (
      <div className="p-3 bg-white dark:bg-slate-800 rounded border shadow-sm text-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-semibold">Tank mismatch</div>
            <div className="text-xs text-slate-500 mt-1">Quick interpretation</div>
          </div>
          <div className="text-xs text-slate-400">
            {d.flagged ? <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700">Flagged</span> : <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-700">Info</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          <div className="space-y-1">
            <div className="text-xs text-slate-500">T0</div>
            <div className="font-medium">{(t0.reading_id || "").slice(0,8)} • {t0.measured_at ? new Date(t0.measured_at).toLocaleString() : "—"}</div>
            <div className="text-xs text-slate-600">Level: {t0.level ?? "—"} L</div>
            <div className="text-xs text-slate-600">Sales between: {total_dispensed} L</div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-slate-500">T1</div>
            <div className="font-medium">{(t1.reading_id || "").slice(0,8)} • {t1.measured_at ? new Date(t1.measured_at).toLocaleString() : "—"}</div>
            <div className="text-xs text-slate-600">Actual: {actual} L</div>
            <div className="text-xs text-slate-600">Expected: {expected} L</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-600">
          <div><strong>Difference:</strong> {delta} L • {pct !== "—" ? `${pct}%` : "—"}</div>
          <div className="mt-2">Plain: The tank is {delta && parseFloat(delta) < 0 ? `${Math.abs(parseFloat(delta))} L higher than expected` : delta && parseFloat(delta) > 0 ? `${delta} L lower than expected` : "showing no significant difference"}.</div>
        </div>
      </div>
    );
  }

  // loadData exposed so event handlers can call it
  const loadData = useCallback(async () => {
    try {
      const r = await api.get("stations/");
      const st = r.data?.results?.[0] || (Array.isArray(r.data) ? r.data[0] : r.data);
      if (!st) {
        setMessage({ type: "warn", text: "No station found" });
        setStation(null);
        setPumps([]);
        setTransactions([]);
        setAnomalies([]);
        setAnomaliesNext(null);
        return;
      }
      setStation(st);

      // fetch pumps, recent transactions and anomalies in parallel
      // anomalies use smaller page_size to support pagination in UI
      const [pumpsRes, txRes, anRes] = await Promise.allSettled([
        api.get(`stations/${st.id}/pumps/`),
        api.get(`stations/${st.id}/transactions/?page_size=20`),
        api.get(`anomalies/?station=${encodeURIComponent(st.id)}&page_size=5`),
      ]);

      if (pumpsRes.status === "fulfilled") {
        const list = pumpsRes.value.data?.results || pumpsRes.value.data || [];
        const normalized = list.map((p) => ({
          ...p,
          id: p.id ?? p.uuid,
          pump_number: p.pump_number ?? p.number ?? (p.id ? String(p.id) : undefined),
          fuel_type: p.fuel_type ?? p.fuel ?? p.metadata?.fuel_type ?? p.metadata?.fuel ?? p.fuelType ?? null,
          metadata: p.metadata ?? {},
        }));
        setPumps(normalized);
      } else {
        setPumps([]);
      }

      if (txRes.status === "fulfilled") {
        const txs = txRes.value.data?.results || txRes.value.data || [];
        setTransactions(txs);
      } else {
        setTransactions([]);
      }

      if (anRes.status === "fulfilled") {
        const data = anRes.value.data;
        // support both list and paginated response
        if (Array.isArray(data)) {
          setAnomalies(data);
          setAnomaliesNext(null);
        } else {
          setAnomalies(data.results || []);
          setAnomaliesNext(data.next || null);
        }
      } else {
        setAnomalies([]);
        setAnomaliesNext(null);
      }
    } catch (err) {
      console.error("POS load failed", err);
      setMessage({ type: "error", text: "Failed to load POS data" });
    }
  }, []);

  // initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load more anomalies (pagination)
  async function loadMoreAnomalies() {
    if (!anomaliesNext) return;
    setAnomaliesLoading(true);
    try {
      const res = await api.get(anomaliesNext);
      const data = res.data;
      if (Array.isArray(data)) {
        // append array
        setAnomalies((prev) => [...prev, ...data]);
        setAnomaliesNext(null);
      } else {
        setAnomalies((prev) => [...prev, ...(data.results || [])]);
        setAnomaliesNext(data.next || null);
      }
    } catch (e) {
      console.error("Load more anomalies failed", e);
      setMessage({ type: "error", text: "Failed to load more anomalies." });
    } finally {
      setAnomaliesLoading(false);
    }
  }

  // Listen for global pump update and reconcile events
  useEffect(() => {
    function handlePumpUpdated(e) {
      const updated = e?.detail;
      if (!updated || !updated.id) return;
      setPumps((prev) => (prev || []).map((p) => (String(p.id) === String(updated.id) ? { ...p, ...updated } : p)));
      setSelectedPump((cur) => (cur && String(cur.id) === String(updated.id) ? { ...cur, ...updated } : cur));
    }

    function handleReconcileEvent(e) {
      // event detail might include stationId or tankId
      loadData();
      const detail = e?.detail || {};
      if (detail.tankId) setMessage({ type: "info", text: `Reconcile requested for tank ${String(detail.tankId).slice(0,8)}` });
      else setMessage({ type: "info", text: "Reconciliation run completed" });
      // clear message shortly
      setTimeout(() => setMessage(null), 4000);
    }

    window.addEventListener("fg:pump_updated", handlePumpUpdated);
    window.addEventListener("fg:reconcile_done", handleReconcileEvent);
    window.addEventListener("fg:reconcile_requested", handleReconcileEvent);
    return () => {
      window.removeEventListener("fg:pump_updated", handlePumpUpdated);
      window.removeEventListener("fg:reconcile_done", handleReconcileEvent);
      window.removeEventListener("fg:reconcile_requested", handleReconcileEvent);
    };
  }, [loadData]);

  useEffect(() => {
    if (!selectedPump) return;
    if (selectedPump.metadata?.unit_price) setUnitPrice(String(selectedPump.metadata.unit_price));
    else if (selectedPump.unit_price) setUnitPrice(String(selectedPump.unit_price));
  }, [selectedPump]);

  const computed = useMemo(() => {
    const p = parseFloat(unitPrice || 0) || 0;
    const l = parseFloat(liters || 0) || 0;
    const a = parseFloat(amount || 0) || 0;
    if (mode === "liters") return { volume_l: l, unit_price: p, total_amount: +(l * p || 0).toFixed(2) };
    const v = p > 0 ? +(a / p).toFixed(3) : 0;
    return { volume_l: v, unit_price: p, total_amount: a };
  }, [mode, liters, unitPrice, amount]);

  async function createTransaction() {
    if (!selectedPump || !station) { setMessage({ type: "error", text: "Select pump" }); return; }
    setBusy(true); setMessage(null);

    const payload = {
      station: station.id,
      pump: selectedPump.id,
      timestamp: new Date().toISOString(),
      volume_l: computed.volume_l,
      unit_price: computed.unit_price,
      total_amount: computed.total_amount,
    };

    try {
      const res = await api.post("transactions/", payload);
      const data = res.data || {};
      const txObj = { id: data.transaction_id || data.id || `${Date.now()}`, ...payload, timestamp: payload.timestamp };
      setTransactions((prev) => [txObj, ...prev].slice(0, 50));
      setLiters(""); setAmount("");
      setMessage({ type: "success", text: "Transaction created." });

      if (data.receipt_token) {
        setCurrentReceiptToken(data.receipt_token);
        setCurrentTxForReceipt(txObj);
        setReceiptModalOpen(true);
      }

      // refresh after short delay
      setTimeout(() => loadData(), 800);
    } catch (e) {
      console.error("create tx failed", e);
      const status = e?.response?.status;
      if (status === 401) {
        setMessage({ type: "error", text: "Authentication credentials were not provided. Please login." });
      } else {
        setMessage({ type: "error", text: `Transaction failed: ${JSON.stringify(e?.response?.data || e?.message)}` });
      }
    } finally {
      setBusy(false);
    }
  }

  function TransactionRow({ tx }) {
    const pumpLabel = tx.pump?.pump_number ?? tx.pump ?? "—";
    return (
      <div className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md transition">
        <div>
          <div className="font-medium text-slate-800 dark:text-slate-100">Tx {String(tx.id).slice(0,8)}</div>
          <div className="text-sm text-slate-500 dark:text-slate-300">Pump: {pumpLabel}</div>
          <div className="text-sm text-slate-500 dark:text-slate-300">Vol: {tx.volume_l ?? "—"} L • Amount: {tx.total_amount ?? "—"}</div>
          <div className="text-xs text-slate-400 dark:text-slate-400">{new Date(tx.timestamp || tx.created_at || Date.now()).toLocaleString()}</div>
        </div>
        <TxWithReceiptButtons tx={tx} onReceiptCreated={() => setMessage({ type: "success", text: "Receipt created" })} />
      </div>
    );
  }

  const selectedFuel = selectedPump?.fuel_type ?? selectedPump?.metadata?.fuel_type ?? "Unknown";

  // helper to get tankId for the selected pump (common places to store it)
  const selectedTankId = selectedPump?.metadata?.tank_id || selectedPump?.tank_id || null;

  // toggle to show raw JSON per anomaly (local UI only)
  const [showRawMap, setShowRawMap] = useState({});

  return (
    <div className={`min-h-screen py-8 transition-colors duration-300 ${dark ? "bg-slate-900 text-slate-200" : "bg-gradient-to-br from-sky-50 to-indigo-50 text-slate-800"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 flex items-center justify-center shadow-xl text-white text-xl font-extrabold">FG</div>
            <div>
              <h1 className="text-2xl font-extrabold">Attendant POS</h1>
              <p className="text-sm text-slate-500 dark:text-slate-300">Fast checkout for station attendants — create transactions & issue receipts.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {station && (
              // prominent station-level reconcile button
              <div className="mr-2">
                <ReconcileButton stationId={station.id} onDone={() => setTimeout(() => loadData(), 600)} />
              </div>
            )}

            <div className="text-sm text-slate-500 dark:text-slate-300">{user?.username} • {user?.profile?.role ?? "—"}</div>

            <button
              aria-pressed={dark}
              onClick={() => setDark((v) => !v)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/80 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 shadow-sm"
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
              <span className="text-sm">{dark ? "Dark" : "Light"}</span>
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded ${message.type === "error" ? "bg-rose-50 text-rose-700" : (message.type === "warn" ? "bg-amber-50 text-amber-800" : message.type === "info" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700")}`}>
            {message.text}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="glass">
              <h2 className="font-semibold text-lg mb-3">Pumps</h2>
              <div className="grid grid-cols-3 gap-4">
                {pumps.length === 0 ? (
                  <div className="col-span-3 text-center text-slate-400 dark:text-slate-300 py-8">No pumps</div>
                ) : (
                  pumps.map(p => (
                    <PumpCard key={p.id} pump={p} onOpen={setSelectedPump} selected={selectedPump?.id === p.id} />
                  ))
                )}
              </div>
            </div>

            <div className="glass">
              <h2 className="font-semibold text-lg mb-3">Create Transaction</h2>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <input
                  type="number"
                  inputMode="decimal"
                  value={mode === "liters" ? liters : amount}
                  onChange={(e) => mode === "liters" ? setLiters(e.target.value) : setAmount(e.target.value)}
                  placeholder={mode === "liters" ? "Liters" : "Amount"}
                  className="border p-2 rounded w-full bg-white dark:bg-slate-700/60"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="Unit Price"
                  className="border p-2 rounded w-full bg-white dark:bg-slate-700/60"
                />
                <div className="border p-2 rounded flex items-center justify-between font-semibold bg-slate-50 dark:bg-slate-700/50">
                  {mode === "liters" ? `Total: ${(computed.total_amount||0).toFixed(2)}` : `Liters: ${computed.volume_l}`}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={createTransaction} disabled={busy} className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 transition">{busy ? "Working..." : "Create Transaction"}</button>
                <button onClick={() => { setLiters(""); setAmount(""); setUnitPrice(""); }} className="px-4 py-2 border rounded">Clear</button>
                <select value={mode} onChange={(e) => setMode(e.target.value)} className="border rounded p-2 ml-auto bg-white dark:bg-slate-700/60">
                  <option value="liters">Liters</option>
                  <option value="amount">Amount</option>
                </select>
              </div>
            </div>

            <div className="glass">
              <h2 className="font-semibold text-lg mb-3">Recent Transactions</h2>
              <div className="space-y-3">
                {transactions.length === 0 ? <div className="text-slate-400 dark:text-slate-300">No transactions yet</div> : transactions.map(tx => <TransactionRow key={tx.id || tx.transaction_id} tx={tx} />)}
              </div>
            </div>

            <div className="glass">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-lg">Recent Anomalies</h2>
                <div className="text-xs text-slate-500">Showing latest — click "Load more" for older</div>
              </div>

              <div className="space-y-3">
                {anomalies.length === 0 ? (
                  <div className="text-slate-400 dark:text-slate-300">No anomalies detected</div>
                ) : (
                  anomalies.map(a => (
                    <div key={a.id} className="p-3 rounded border bg-white dark:bg-slate-800">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="font-medium">{a.name || a.rule}</div>
                            <div className="text-xs text-slate-400">• {a.severity}</div>
                            <div className="text-xs text-slate-400">• score: {a.score ?? "—"}</div>
                          </div>

                          <div className="text-xs text-slate-400 mt-1">{new Date(a.created_at).toLocaleString()}</div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <div className="text-xs text-slate-400">{a.pump ? `Pump: ${String(a.pump).slice(0,8)}` : ""}</div>
                          <div className="flex gap-2">
                            <button onClick={() => setShowRawMap(prev => ({ ...prev, [a.id]: !prev[a.id] }))} className="px-2 py-1 text-xs rounded border">
                              {showRawMap[a.id] ? "Hide JSON" : "View JSON"}
                            </button>
                            <button onClick={() => { setMessage({ type: "info", text: "Acknowledge action available on Anomalies page." }); setTimeout(() => setMessage(null), 2500); }} className="px-2 py-1 text-xs rounded bg-amber-100">Acknowledge</button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3">
                        {isTankMismatch(a) ? (
                          <TankMismatchSummary details={a.details} />
                        ) : (
                          <div className="text-xs text-slate-600 dark:text-slate-300">{a.details ? (typeof a.details === "string" ? a.details : JSON.stringify(a.details, null, 2)).slice(0, 300) : "No details"}</div>
                        )}
                      </div>

                      {showRawMap[a.id] && (
                        <pre className="mt-3 p-2 bg-slate-100 dark:bg-slate-800 rounded text-xs overflow-auto">{JSON.stringify(a.details || {}, null, 2)}</pre>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* pagination control */}
              <div className="mt-4 flex items-center justify-center">
                {anomaliesNext ? (
                  <button onClick={loadMoreAnomalies} disabled={anomaliesLoading} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                    {anomaliesLoading ? "Loading..." : "Load more anomalies"}
                  </button>
                ) : (
                  <div className="text-xs text-slate-500">No older anomalies</div>
                )}
              </div>
            </div>

          </div>

          <div className="space-y-6">
            <div className="glass p-4">
              <h3 className="font-semibold text-lg">Selected Pump Info</h3>
              {selectedPump ? (
                <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                  <div><strong>Pump:</strong> {selectedPump.pump_number}</div>
                  <div><strong>Fuel:</strong> {selectedFuel}</div>
                  <div><strong>Nozzle:</strong> {selectedPump.nozzle_id ?? "—"}</div>
                  <div><strong>Calibration:</strong> {selectedPump.calibration_factor ?? "1.0"}</div>

                  <div className="text-xs text-slate-500 dark:text-slate-400">Metadata:</div>
                  <pre className="bg-slate-100 dark:bg-slate-800 p-2 rounded text-xs overflow-auto">{JSON.stringify(selectedPump.metadata || {}, null, 2)}</pre>

                  {/* Tank-level reconcile (visible only if pump metadata contains tank_id) */}
                  <div className="mt-3">
                    <RunReconcileButton tankId={selectedTankId} onDone={() => setTimeout(() => loadData(), 600)} />
                  </div>

                  {/* Also show station-level reconcile here for convenience */}
                  <div className="mt-3">
                    {station && <ReconcileButton stationId={station.id} onDone={() => setTimeout(() => loadData(), 600)} />}
                  </div>
                </div>
              ) : <div className="text-slate-400 dark:text-slate-300">Select a pump to see details</div>}
            </div>

            <div className="glass p-4">
              <h3 className="font-semibold text-lg">Quick Help</h3>
              <ol className="list-decimal list-inside text-sm text-slate-600 dark:text-slate-300 space-y-1 mt-2">
                <li>Select pump</li>
                <li>Choose mode (Liters / Amount)</li>
                <li>Fill liters or amount + unit price</li>
                <li>Click <strong>Create Transaction</strong></li>
                <li>Click Create Receipt on the transaction row to issue a QR/receipt</li>
                <li>To run a tank reconciliation (auto anomaly detection), either click the station "Run Reconcile" in the header or select a pump (with tank) and click "Run Reconciliation".</li>
              </ol>
            </div>
          </div>
        </div>

        <ReceiptModal
          open={receiptModalOpen}
          onClose={() => setReceiptModalOpen(false)}
          receipt={currentTxForReceipt ? { ...currentTxForReceipt, receipt_token: currentReceiptToken } : null}
        />
      </div>
    </div>
  );
}
