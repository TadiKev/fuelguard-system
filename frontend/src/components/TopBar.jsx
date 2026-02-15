// src/components/TopBar.jsx
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearTokens } from "../utils/auth";

/**
 * TopBar
 * - Provides ThemeContext and useTheme()
 * - Renders header/nav + theme toggle + mobile menu
 * - Persists theme to localStorage key: 'fg-dark'
 *
 * Use: <TopBar authed={authed} setAuthed={setAuthed} />
 * Pages/components can read theme with: const { dark, toggle } = useTheme();
 */

const ThemeContext = createContext({ dark: false, toggle: () => {} });
export function useTheme() { return useContext(ThemeContext); }

export default function TopBar({ authed = false, setAuthed = () => {} }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false); // mobile menu

  // initialize theme from localStorage or system preference
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("fg-dark");
      if (saved === null) {
        return typeof window !== "undefined" && window.matchMedia
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : false;
      }
      return saved === "1";
    } catch {
      return false;
    }
  });

  // keep DOM <html> class in sync and persist to localStorage
  useEffect(() => {
    try {
      if (dark) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("fg-dark", "1");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("fg-dark", "0");
      }
    } catch (e) {
      // ignore (e.g. SSR)
      // console.warn("theme sync failed", e);
    }
  }, [dark]);

  // respond to OS-level preference changes while app is open
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (ev) => {
      // only change if user hasn't explicitly set a preference (i.e., no localStorage key)
      try {
        const saved = localStorage.getItem("fg-dark");
        if (saved === null) {
          setDark(ev.matches);
        }
      } catch {}
    };
    mq.addEventListener ? mq.addEventListener("change", listener) : mq.addListener(listener);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", listener) : mq.removeListener(listener);
    };
  }, []);

  const toggle = useCallback(() => setDark((v) => !v), []);

  function logout() {
    try { clearTokens(); } catch {}
    try { setAuthed(false); } catch {}
    nav("/login");
  }

  const ctx = useMemo(() => ({ dark, toggle }), [dark, toggle]);

  return (
    <ThemeContext.Provider value={ctx}>
      <header className="bg-gradient-to-r from-brand-50/80 to-white/40 dark:from-slate-900 dark:to-slate-800 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md">
                  FG
                </div>
                <div className="hidden sm:block">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">FuelGuard</div>
                  <div className="text-xs text-slate-500 dark:text-slate-300">Real-time station monitoring</div>
                </div>
              </Link>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-4 text-sm">
              <NavLink to="/owner" label="Owner" icon={IconDashboard} />
              <NavLink to="/attendant" label="Attendant" icon={IconPump} />
              <NavLink to="/anomalies" label="Anomalies" icon={IconAlert} highlight />
              <NavLink to="/verify" label="Verify" icon={IconReceipt} />

              {authed ? (
                <button
                  onClick={logout}
                  className="ml-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-sm hover:shadow-sm transition"
                  title="Log out"
                >
                  Log out
                </button>
              ) : (
                <Link to="/login" className="ml-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-sm hover:shadow-sm transition">
                  Log in
                </Link>
              )}

              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 ml-2" />

              {/* Dark toggle */}
              <button
                onClick={toggle}
                aria-pressed={dark}
                className="ml-2 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                title="Toggle theme"
              >
                {dark ? <SunIcon /> : <MoonIcon />}
              </button>
            </nav>

            {/* Mobile icons */}
            <div className="md:hidden flex items-center gap-2">
              <button
                onClick={toggle}
                className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                title="Toggle theme"
              >
                {dark ? <SunIcon /> : <MoonIcon />}
              </button>

              <button
                onClick={() => setOpen((s) => !s)}
                aria-expanded={open}
                aria-controls="mobile-nav"
                className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                {open ? <CloseIcon /> : <MenuIcon />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile nav panel */}
        {open && (
          <div id="mobile-nav" className="md:hidden border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900/60 backdrop-blur-sm">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-2">
              <MobileLink to="/owner" onClick={() => setOpen(false)} icon={IconDashboard}>Owner</MobileLink>
              <MobileLink to="/attendant" onClick={() => setOpen(false)} icon={IconPump}>Attendant</MobileLink>
              <MobileLink to="/anomalies" onClick={() => setOpen(false)} icon={IconAlert} highlight>Anomalies</MobileLink>
              <MobileLink to="/verify" onClick={() => setOpen(false)} icon={IconReceipt}>Verify Receipt</MobileLink>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-700 mt-2 flex items-center gap-2">
                {authed ? (
                  <button
                    onClick={() => { logout(); setOpen(false); }}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800"
                  >
                    Log out
                  </button>
                ) : (
                  <Link to="/login" onClick={() => setOpen(false)} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800">
                    Log in
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </header>
    </ThemeContext.Provider>
  );
}

/* ---------- helpers ---------- */

function NavLink({ to, label, icon: Icon, highlight = false }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2 px-2 py-1 rounded-md ${highlight ? "text-slate-900 dark:text-white font-semibold" : "text-slate-700 dark:text-slate-300"} hover:bg-slate-50 dark:hover:bg-slate-800 transition`}>
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

function MobileLink({ to, children, icon: Icon, onClick = () => {}, highlight = false }) {
  return (
    <Link to={to} onClick={onClick} className={`flex items-center gap-3 px-3 py-2 rounded-md ${highlight ? "bg-brand-100/60 dark:bg-indigo-700/40" : "hover:bg-slate-50 dark:hover:bg-slate-800"} transition`}>
      <Icon className="h-5 w-5" />
      <span className={`${highlight ? "font-semibold" : ""}`}>{children}</span>
    </Link>
  );
}

/* ---------- icons ---------- */

const SunIcon = () => (
  <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
    <path d="M10 4.5a.75.75 0 01.75.75V7a.75.75 0 01-1.5 0V5.25A.75.75 0 0110 4.5zM10 12.75a2.75 2.75 0 100-5.5 2.75 2.75 0 000 5.5z" />
  </svg>
);

const MoonIcon = () => (
  <svg className="h-5 w-5 text-indigo-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
    <path d="M17.293 13.293A8 8 0 016.707 2.707 7 7 0 1017.293 13.293z" />
  </svg>
);

const MenuIcon = () => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const CloseIcon = () => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function IconDashboard(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M3 13h8V3H3v10zM13 21h8V11h-8v10zM13 3v6M3 21v-6" /></svg>;
}
function IconPump(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M6 3v12a3 3 0 003 3h6a3 3 0 003-3V8a3 3 0 00-3-3h-1V3H6zM6 7h8" /></svg>;
}
function IconAlert(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /></svg>;
}
function IconReceipt(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M7 21l-2-2V5a1 1 0 011-1h10a1 1 0 011 1v14l-2 2H7z" /></svg>;
}
