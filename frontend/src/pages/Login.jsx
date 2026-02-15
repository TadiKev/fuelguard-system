// src/pages/Login.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { motion } from "framer-motion";
import { User, Lock, LogIn } from "lucide-react";

/**
 * Robust Login page:
 *  - Tries multiple image filenames from public/ to avoid mismatches
 *  - Uses the chosen image as a full-screen background (cover, centered)
 *  - Applies a tasteful dark gradient overlay so text is readable
 */

export default function Login({ onAuth } = {}) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bgUrl, setBgUrl] = useState(null);
  const navigate = useNavigate();

  // List of candidate filenames to try (public/)
  const IMG_BASE = "view-woman-with-car-gas-station";
  const CANDIDATES = [
    `/${IMG_BASE}.jpg`,
    `/${IMG_BASE}.jpeg`,
    `/${IMG_BASE}.jpg.jpeg`,
    `/${IMG_BASE}.jpeg.jpg`,
  ];

  useEffect(() => {
    let mounted = true;
    let cancelled = false;
    const tryLoad = (idx = 0) => {
      if (!mounted) return;
      if (idx >= CANDIDATES.length) {
        if (mounted) setBgUrl(null);
        return;
      }
      const src = CANDIDATES[idx];
      const img = new Image();
      img.onload = () => {
        if (!cancelled && mounted) setBgUrl(src);
      };
      img.onerror = () => {
        // try next candidate
        tryLoad(idx + 1);
      };
      img.src = src;
    };
    tryLoad();
    return () => {
      mounted = false;
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(username, password);
      onAuth?.();
      navigate("/");
    } catch (e) {
      const msg = e?.response?.data || e.message || "Login failed";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  // build background style: if bgUrl available use gradient + image; else fallback gradient
  const backgroundStyle = bgUrl
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url('${bgUrl}')`,
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
      }
    : {
        // fallback pleasant dark gradient
        backgroundImage: "linear-gradient(180deg,#0f172a,#020617)",
      };

  return (
    <div
      className="min-h-screen w-full relative flex items-center justify-center overflow-hidden"
      style={backgroundStyle}
    >
      {/* faint vignette (keeps the feel and focuses center) */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/10 via-transparent to-black/20" aria-hidden />

      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md p-8 rounded-2xl shadow-2xl"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="text-center mb-6">
          <h2 className="text-3xl font-extrabold text-white drop-shadow-sm">Welcome back</h2>
          <p className="text-sm text-white/75 mt-1">Sign in to your station dashboard</p>
        </div>

        {err && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 text-sm text-rose-200 bg-rose-600/10 border border-rose-600/20 rounded-lg px-3 py-2"
          >
            {typeof err === "string" ? err : JSON.stringify(err)}
          </motion.div>
        )}

        <div className="space-y-4">
          <label className="block text-sm text-white/80">Username</label>
          <div className="flex items-center gap-3 bg-white/6 border border-white/8 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
            <User className="w-4 h-4 text-white/60" />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="w-full bg-transparent text-white placeholder-white/40 px-2 py-1 outline-none"
              autoComplete="username"
            />
          </div>

          <label className="block text-sm text-white/80">Password</label>
          <div className="flex items-center gap-3 bg-white/6 border border-white/8 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
            <Lock className="w-4 h-4 text-white/60" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-transparent text-white placeholder-white/40 px-2 py-1 outline-none"
              autoComplete="current-password"
            />
          </div>
        </div>

        <div className="mt-6">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={loading}
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold shadow-lg"
            style={{
              background: "linear-gradient(90deg,#6366f1,#8b5cf6)",
              boxShadow: "0 10px 25px rgba(99,102,241,0.12)",
            }}
          >
            {loading ? "Signing in..." : (
              <>
                <LogIn className="w-4 h-4" />
                Sign in
              </>
            )}
          </motion.button>
        </div>

        <p className="text-center text-white/60 text-xs mt-5">Secure • Encrypted • Trusted</p>
      </motion.form>

      <div className="absolute left-4 bottom-4 text-xs text-white/40 z-10 select-none">
        Photo credit: Station image
      </div>
    </div>
  );
}
