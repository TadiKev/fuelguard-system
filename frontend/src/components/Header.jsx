// src/components/Header.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { clearTokens } from "../utils/auth";

/**
 * Clean Header — preserves the exact gradients/colors you provided.
 * - Keeps role-based visibility (attendants won't see Owner & Anomalies)
 * - Responsive: desktop nav + mobile panel
 * - Simple auth area: Log in (when not authed) or username + Log out (when authed)
 */
export default function Header({ authed, setAuthed }) {
  const { user } = useAuth() || {};
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // preserve user's provided inline colors exactly
  const headerBg =
    "linear-gradient(90deg, rgba(0, 0, 0, 0.49) 0%, rgba(0, 0, 0, 0.57) 50%, rgba(0, 0, 0, 0.55) 100%)";
  const brandBg =
    "linear-gradient(135deg, rgba(30,144,255,1) 0%, rgb(12, 8, 20) 100%)";

  // username / role shapes (compatible with common AuthProvider shapes)
  const username = user?.username ?? user?.name ?? null;
  const role = user?.profile?.role ?? user?.role ?? null;

  // Role visibility — ensure attendants don't see Owner & Anomalies
  const canSeeOwner = role === "admin" || role === "station_owner";
  const canSeeAnomalies =
    role === "admin" || role === "station_owner" || role === "regulator";
  const canSeeAttendant =
    role === "admin" || role === "station_owner" || role === "attendant";

  function logout() {
    clearTokens();
    setAuthed(false);
    nav("/login");
  }

  // initials fallback for avatar
  const initials = (() => {
    if (!username) return "FG";
    const parts = username.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  })();

  return (
    <header
      className="w-full sticky top-0 z-40"
      style={{
        background: headerBg,
        backdropFilter: "saturate(120%) blur(6px)",
      }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-4">
        {/* Brand */}
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-extrabold shadow-md"
              style={{ background: brandBg }}
              aria-hidden
            >
              FG
            </div>

            <div>
              <div className="text-lg font-bold leading-4">FuelGuard</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Real-time station monitoring
              </div>
            </div>
          </Link>
        </div>

        {/* Desktop navigation */}
<nav className="hidden md:flex items-center gap-1 text-[13.5px] font-medium tracking-[0.01em]">
  {canSeeOwner && (
    <Link
      to="/owner"
      className="relative px-3.5 py-2 rounded-md text-white/90 transition-all duration-200
                 hover:bg-white/20 hover:text-white
                 focus:outline-none focus:ring-2 focus:ring-white/40
                 after:absolute after:left-3 after:right-3 after:-bottom-0.5 after:h-[2px]
                 after:scale-x-0 after:rounded-full after:bg-white/80
                 after:transition-transform after:duration-200
                 hover:after:scale-x-100"
    >
      Owner
    </Link>
  )}

  {canSeeAttendant && (
    <Link
      to="/attendant"
      className="relative px-3.5 py-2 rounded-md text-white/90 transition-all duration-200
                 hover:bg-white/20 hover:text-white
                 focus:outline-none focus:ring-2 focus:ring-white/40
                 after:absolute after:left-3 after:right-3 after:-bottom-0.5 after:h-[2px]
                 after:scale-x-0 after:rounded-full after:bg-white/80
                 after:transition-transform after:duration-200
                 hover:after:scale-x-100"
    >
      Attendant
    </Link>
  )}

  {canSeeAnomalies && (
    <Link
      to="/anomalies"
      className="relative px-3.5 py-2 rounded-md text-white font-semibold transition-all duration-200
                 hover:bg-white/20
                 focus:outline-none focus:ring-2 focus:ring-white/40
                 after:absolute after:left-3 after:right-3 after:-bottom-0.5 after:h-[2px]
                 after:scale-x-0 after:rounded-full after:bg-white
                 after:transition-transform after:duration-200
                 hover:after:scale-x-100"
    >
      Anomalies
    </Link>
  )}

  <Link
    to="/verify"
    className="relative px-3.5 py-2 rounded-md text-white/90 transition-all duration-200
               hover:bg-white/20 hover:text-white
               focus:outline-none focus:ring-2 focus:ring-white/40
               after:absolute after:left-3 after:right-3 after:-bottom-0.5 after:h-[2px]
               after:scale-x-0 after:rounded-full after:bg-white/80
               after:transition-transform after:duration-200
               hover:after:scale-x-100"
  >
    Verify Receipt
  </Link>
</nav>


        {/* Right area: simple auth actions */}
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 rounded-md bg-white/20 hover:bg-white/30 transition"
            onClick={() => setMobileOpen((s) => !s)}
            aria-expanded={mobileOpen}
            aria-label="Toggle menu"
          >
            {/* hamburger / close icon */}
            <svg
              className="w-5 h-5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              {mobileOpen ? (
                <path
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>

          {/* If authed: show username pill + Log out button.
              If not authed: show Log in link. */}
          {authed && username ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 px-3 py-1 rounded-full bg-white/90 shadow-sm">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold"
                  style={{ background: brandBg }}
                >
                  {initials}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-800">{username}</span>
                  <span className="text-xs text-slate-500 truncate">{role ?? "—"}</span>
                </div>
              </div>

              <button
                onClick={logout}
                className="ml-2 px-3 py-1 rounded-md bg-white text-slate-800 hover:opacity-95 transition shadow"
              >
                Log out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="ml-3 px-3 py-1 rounded-md bg-white text-slate-800 hover:opacity-95 transition shadow"
            >
              Log in
            </Link>
          )}
        </div>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="md:hidden px-4 pb-4" id="mobile-menu" role="menu" aria-label="Mobile menu">
          <div className="flex flex-col gap-2">
            {canSeeOwner && (
              <Link
                to="/owner"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-md hover:bg-white/30 transition font-medium text-slate-800/90"
              >
                Owner
              </Link>
            )}

            {canSeeAttendant && (
              <Link
                to="/attendant"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-md hover:bg-white/30 transition text-slate-800/90"
              >
                Attendant
              </Link>
            )}

            {canSeeAnomalies && (
              <Link
                to="/anomalies"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-md hover:bg-white/30 transition font-semibold text-slate-800/90"
              >
                Anomalies
              </Link>
            )}

            <Link
              to="/verify"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 rounded-md hover:bg-white/30 transition text-slate-800/90"
            >
              Verify Receipt
            </Link>

            <div className="pt-2 border-t border-white/20 flex items-center justify-between">
              <div className="text-xs text-slate-600">
                {authed ? `Signed in as ${username ?? "—"} • ${role ?? "—"}` : "Not signed in"}
              </div>

              {authed ? (
                <button
                  onClick={() => {
                    logout();
                    setMobileOpen(false);
                  }}
                  className="ml-2 px-3 py-1 rounded-md bg-white text-slate-800 hover:opacity-95 transition shadow"
                >
                  Log out
                </button>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="ml-2 px-3 py-1 rounded-md bg-white text-slate-800 hover:opacity-95 transition shadow"
                >
                  Log in
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
