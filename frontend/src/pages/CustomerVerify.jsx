// src/pages/CustomerVerify.jsx
import React, { useState } from "react";
import api from "../services/api";

/**
 * CustomerVerify — fixed to call backend (not frontend dev server)
 *
 * Important:
 * - Set VITE_API_BASE to your backend origin (e.g. https://api.example.com or http://localhost:8000)
 *   in your .env (Vite) for best results.
 * - If you do not set VITE_API_BASE, this code falls back to api.defaults.baseURL (if available),
 *   then to window.location.origin.
 * - Server must allow CORS if frontend and backend are on different origins.
 */

function Badge({ children, tone = "info" }) {
  const map = {
    info: "bg-sky-50 text-sky-800",
    success: "bg-emerald-50 text-emerald-800",
    warn: "bg-amber-50 text-amber-800",
    danger: "bg-rose-50 text-rose-800",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${map[tone] || map.info}`}>{children}</span>;
}

function fmtDate(v) {
  if (!v) return "—";
  try {
    if (typeof v === "number" || /^[0-9]+$/.test(String(v))) {
      const s = String(v);
      const ms = s.length <= 10 ? Number(s) * 1000 : Number(s);
      return new Date(ms).toLocaleString();
    }
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

// shallow-first recursive find
function findKey(obj, targetKeys = []) {
  if (obj == null) return undefined;
  if (typeof obj !== "object") return undefined;

  for (const key of Object.keys(obj)) {
    if (targetKeys.includes(key)) return obj[key];
  }
  for (const key of Object.keys(obj)) {
    try {
      const val = obj[key];
      if (val && typeof val === "object") {
        const found = findKey(val, targetKeys);
        if (found !== undefined) return found;
      }
    } catch {}
  }
  return undefined;
}

/* ------------------ determine backend base URL ------------------ */

function normalizeBaseUrl(u) {
  if (!u) return null;
  // remove trailing slash
  return u.replace(/\/+$/, "");
}

const ENV_API_BASE = typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_BASE : undefined;
const API_BASE =
  normalizeBaseUrl(ENV_API_BASE) ||
  (api && api.defaults && api.defaults.baseURL ? normalizeBaseUrl(api.defaults.baseURL) : null) ||
  normalizeBaseUrl(window.location.origin);

/* ------------------ candidate endpoints (absolute) ------------------ */

function abs(path) {
  // if path already absolute (starts with http), return as-is
  if (/^https?:\/\//i.test(path)) return path;
  // allow leading slash
  const p = path.replace(/^\/+/, "");
  return `${API_BASE}/${p}`;
}

const POST_CANDIDATES = [
  abs("api/receipts/verify/"),
  abs("receipts/verify/"),
  abs("api/v1/receipts/verify/"),
  abs("v1/receipts/verify/"),
];

const GET_LEGACY_CANDIDATES = (token) => [
  abs(`receipts/${encodeURIComponent(token)}/verify/`),
  abs(`api/receipts/${encodeURIComponent(token)}/verify/`),
  abs(`api/v1/receipts/${encodeURIComponent(token)}/verify/`),
  abs(`v1/receipts/${encodeURIComponent(token)}/verify/`),
];

/* ------------------ helpers to detect HTML responses ------------------ */

function looksLikeHtml(text) {
  if (!text || typeof text !== "string") return false;
  const s = text.trim().slice(0, 200).toLowerCase();
  return s.startsWith("<!doctype") || s.startsWith("<html") || s.includes("vite/client") || s.includes("<div id=\"root\"");
}

/* ------------------ network attempts (public-first) ------------------ */

async function tryPublicPostEndpoints(token) {
  for (const url of POST_CANDIDATES) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt_token: token }),
        // if backend is same-origin and uses cookies, keep credentials; this is fine for many setups.
        credentials: "include",
      });

      const text = await resp.text().catch(() => null);
      if (looksLikeHtml(text)) {
        // not the API — skip this candidate
        continue;
      }

      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      return { ok: resp.ok, status: resp.status, url, data };
    } catch (e) {
      // network error or CORS/blocking — try next
      continue;
    }
  }
  return { ok: false, error: "No public POST endpoint responded" };
}

async function tryPublicGetLegacy(token) {
  const candidates = GET_LEGACY_CANDIDATES(token);
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { method: "GET", credentials: "include" });
      const text = await resp.text().catch(() => null);
      if (looksLikeHtml(text)) continue;
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { ok: resp.ok, status: resp.status, url, data };
    } catch (e) {
      continue;
    }
  }
  return { ok: false, error: "No public GET legacy endpoint responded" };
}

/* ------------------ Component ------------------ */

export default function CustomerVerify() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    setResult(null);
    setLoading(true);
    const t = (token || "").trim();
    if (!t) {
      setResult({ ok: false, error: "Please paste a receipt token.", source: "client" });
      setLoading(false);
      return;
    }

    try {
      // 1) Try public POST endpoints (absolute URLs) — no Authorization header
      const postResp = await tryPublicPostEndpoints(t);

      if (postResp && postResp.data !== undefined && postResp.data !== null) {
        const data = postResp.data;
        // handle bad_token_format -> legacy GET fallback
        if (data && data.valid === false && data.reason === "bad_token_format") {
          const legacy = await tryPublicGetLegacy(t);
          if (legacy && legacy.data !== undefined && legacy.data !== null) {
            setResult({ ok: !!legacy.data.valid, data: legacy.data, source: "get-public", url: legacy.url, status: legacy.status });
            setLoading(false);
            return;
          }
          setResult({ ok: false, error: legacy.error || "Legacy GET fallback failed", source: "get-public" });
          setLoading(false);
          return;
        }

        setResult({ ok: data && data.valid !== false, data, source: "post-public", url: postResp.url, status: postResp.status });
        setLoading(false);
        return;
      }

      // 2) If public POST returned nothing JSON but ok, accept success
      if (postResp && postResp.ok) {
        setResult({ ok: true, data: null, source: "post-public", url: postResp.url, status: postResp.status });
        setLoading(false);
        return;
      }

      // 3) Try public legacy GET endpoints
      const legacy = await tryPublicGetLegacy(t);
      if (legacy && legacy.data !== undefined && legacy.data !== null) {
        setResult({ ok: !!legacy.data.valid, data: legacy.data, source: "get-public", url: legacy.url, status: legacy.status });
        setLoading(false);
        return;
      }

      // 4) Last resort: use authenticated api client (keeps compatibility)
      try {
        const { data } = await api.post("receipts/verify/", { receipt_token: t });
        if (data && data.valid === false && data.reason === "bad_token_format") {
          // try legacy GET via api client
          try {
            const res = await api.get(`receipts/${encodeURIComponent(t)}/verify/`);
            setResult({ ok: !!res.data.valid, data: res.data, source: "get-auth" });
          } catch (e) {
            const payload = e?.response?.data ?? e?.message ?? String(e);
            setResult({ ok: false, error: payload, source: "get-auth" });
          }
        } else {
          setResult({ ok: data.valid !== false, data, source: "post-auth" });
        }
      } catch (authErr) {
        const payload = authErr?.response?.data ?? authErr?.message ?? String(authErr);
        setResult({ ok: false, error: payload, source: "post-auth" });
      }
    } catch (err) {
      setResult({ ok: false, error: String(err), source: "exception" });
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setToken("");
    setResult(null);
  }

  function copyToken() {
    if (!token) return;
    navigator.clipboard?.writeText(token).then(() => {
      setResult({ ok: true, data: { message: "Token copied to clipboard" }, source: "client" });
      setTimeout(() => setResult(null), 1400);
    }).catch(() => {});
  }

  function renderResult() {
    if (!result) {
      return <div className="text-sm text-slate-500">Paste a receipt token (from SMS/QR) and click <strong>Verify</strong>.</div>;
    }

    if (!result.ok) {
      const err = result.error ?? result.data ?? "Invalid token or server error.";
      if (err && typeof err === "object" && !Array.isArray(err)) {
        if ("valid" in err && err.valid === false && err.reason) {
          return (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Badge tone="warn">Invalid</Badge>
                <div className="font-medium text-amber-800">Verification failed: {String(err.reason)}</div>
              </div>
              <pre className="bg-white/60 p-3 rounded text-xs overflow-auto">{JSON.stringify(err, null, 2)}</pre>
            </div>
          );
        }

        return (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge tone="danger">Error</Badge>
              <div className="font-medium text-rose-800">Could not verify token</div>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded p-3 text-sm mb-3">
              {Object.entries(err).map(([k, v]) => (
                <div key={k} className="mb-2">
                  <div className="text-rose-800 font-medium">{k}</div>
                  <div className="text-rose-700 text-xs">{Array.isArray(v) ? v.join("; ") : String(v)}</div>
                </div>
              ))}
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer">Show raw error</summary>
              <pre className="mt-2 bg-white/60 p-2 rounded text-xs overflow-auto">{JSON.stringify(err, null, 2)}</pre>
            </details>
          </div>
        );
      }

      return (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Badge tone="danger">Invalid</Badge>
            <div className="font-medium text-rose-800">{String(err)}</div>
          </div>
        </div>
      );
    }

    // success
    const payload = result.data ?? {};
    const volume = findKey(payload, ["volume_l", "volume", "vol"]);
    const unit_price = findKey(payload, ["unit_price", "unitPrice", "price", "unit"]);
    const total_amount = findKey(payload, ["total_amount", "total", "amount"]);
    const issuedRaw = findKey(payload, ["issued_at", "issued", "timestamp", "measured_at", "created_at"]);

    const volumeDisplay = volume !== undefined && volume !== null ? String(volume) : "—";
    const unitPriceDisplay = unit_price !== undefined && unit_price !== null ? String(unit_price) : "—";
    const totalAmountDisplay = total_amount !== undefined && total_amount !== null ? String(total_amount) : "—";
    const issuedDisplay = issuedRaw ? fmtDate(issuedRaw) : "—";

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Badge tone="success">Valid</Badge>
          <div className="font-medium text-emerald-800">Receipt verified</div>
          <div className="text-xs text-slate-500 ml-2">via {result.source || "public"}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded border bg-white/60">
            <div className="text-xs text-slate-500">Volume (L)</div>
            <div className="font-semibold">{volumeDisplay}</div>
          </div>

          <div className="p-3 rounded border bg-white/60">
            <div className="text-xs text-slate-500">Unit price</div>
            <div className="font-semibold">{unitPriceDisplay}</div>
          </div>

          <div className="p-3 rounded border bg-white/60">
            <div className="text-xs text-slate-500">Total amount</div>
            <div className="font-semibold">{totalAmountDisplay}</div>
          </div>

          <div className="p-3 rounded border bg-white/60">
            <div className="text-xs text-slate-500">Issued</div>
            <div className="font-semibold">{issuedDisplay}</div>
          </div>
        </div>

        <details className="bg-white/50 p-3 rounded border text-xs">
          <summary className="cursor-pointer font-medium">Show raw JSON</summary>
          <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(payload, null, 2)}</pre>
        </details>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 transition-colors">
      <div className="w-full max-w-xl p-6">
        <div className="bg-white/80 dark:bg-slate-900/60 rounded-2xl p-6 shadow-lg border border-slate-100 dark:border-slate-700">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-2xl font-extrabold">Verify Receipt</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Paste the receipt token (from QR or SMS) to confirm authenticity.</p>
            </div>

            <div className="text-xs text-slate-500">Tip: Useful for customers, attendants & auditors</div>
          </div>

          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-[1fr,auto,auto,auto] gap-3 items-center">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste receipt token here"
              className="w-full rounded-lg border p-3 bg-white dark:bg-slate-800/60 text-sm"
            />

            <button
              type="button"
              onClick={copyToken}
              disabled={!token}
              className="px-3 py-2 rounded-lg border bg-white/40 hover:bg-white/60 text-sm"
            >
              Copy
            </button>

            <button
              type="button"
              onClick={clearAll}
              disabled={!token && !result}
              className="px-3 py-2 rounded-lg border bg-white/40 hover:bg-white/60 text-sm"
            >
              Clear
            </button>

            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 text-sm"
            >
              {loading ? "Checking..." : "Verify"}
            </button>
          </form>

          <div className="mt-6">
            <div className="text-xs text-slate-500 mb-2">Result</div>
            <div className="rounded p-4 bg-white/60 dark:bg-slate-900/60 border">
              {renderResult()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
