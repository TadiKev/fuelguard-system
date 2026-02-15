import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AuthProvider from "./auth/AuthProvider";
import { useAuth } from "./auth/AuthProvider";

import Login from "./pages/Login";
import Register from "./pages/Register";
import OwnerDashboard from "./pages/OwnerDashboard";
import AttendantPOS from "./pages/AttendantPOS";
import RegulatorDashboard from "./pages/RegulatorDashboard";
import CustomerVerify from "./pages/CustomerVerify";
import ReceiptsVerifyPage from "./pages/ReceiptsVerify";
import PumpDetails from "./pages/PumpDetails";
import AnomaliesPage from "./pages/AnomaliesPage"; // ✅ NEW

import Header from "./components/Header";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";
import { getAccess } from "./utils/auth";

/**
 * Wrapper ensures AuthProvider is available everywhere
 */
export default function AppWrapper() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

function AppInner() {
  const [authed, setAuthed] = React.useState(!!getAccess());

  React.useEffect(() => {
    const onStorage = () => setAuthed(!!getAccess());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <Header authed={authed} setAuthed={setAuthed} />

        <main className="max-w-6xl mx-auto p-4">
          <Routes>
            {/* ───────────────── AUTH ───────────────── */}
            <Route
              path="/login"
              element={<Login onAuth={() => setAuthed(true)} />}
            />
            <Route path="/register" element={<Register />} />

            {/* ─────────────── OWNER ─────────────── */}
            <Route
              path="/owner"
              element={
                <RoleRoute allowed={["station_owner", "admin"]}>
                  <OwnerDashboard />
                </RoleRoute>
              }
            />

            {/* ─────────────── ATTENDANT ─────────────── */}
            <Route
              path="/attendant"
              element={
                <RoleRoute allowed={["attendant", "admin", "station_owner"]}>
                  <AttendantPOS />
                </RoleRoute>
              }
            />

            {/* ─────────────── REGULATOR ─────────────── */}
            <Route
              path="/regulator"
              element={
                <RoleRoute allowed={["regulator", "admin"]}>
                  <RegulatorDashboard />
                </RoleRoute>
              }
            />

            {/* ─────────────── ANOMALIES (NEW) ─────────────── */}
            <Route
              path="/anomalies"
              element={
                <RoleRoute allowed={["station_owner", "admin", "regulator"]}>
                  <AnomaliesPage />
                </RoleRoute>
              }
            />

            {/* ─────────────── RECEIPTS ─────────────── */}
            <Route
              path="/receipts/verify"
              element={
                <ProtectedRoute>
                  <ReceiptsVerifyPage />
                </ProtectedRoute>
              }
            />

            {/* Public verification */}
            <Route path="/verify" element={<CustomerVerify />} />

            {/* Pump details */}
            <Route
              path="/pump/:id"
              element={
                <ProtectedRoute>
                  <PumpDetails />
                </ProtectedRoute>
              }
            />

            {/* ─────────────── DEFAULT ─────────────── */}
            <Route path="/" element={<Navigate to="/owner" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
