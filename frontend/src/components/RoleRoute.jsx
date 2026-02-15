// src/components/RoleRoute.jsx
import React from "react";
import ProtectedRoute from "./ProtectedRoute";
import { useAuth } from "../auth/AuthProvider";

/**
 * Usage:
 * <RoleRoute allowed={['station_owner','admin']}>
 *   <OwnerDashboard />
 * </RoleRoute>
 */
export default function RoleRoute({ allowed = [], children, noAccessFallback = "/login" }) {
  return (
    <ProtectedRoute fallback={noAccessFallback}>
      <RoleInner allowed={allowed}>{children}</RoleInner>
    </ProtectedRoute>
  );
}

function RoleInner({ allowed, children }) {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  // try to read role from normalized object
  const role = user?.profile?.role ?? user?.role ?? null;

  // BACKEND ROLES: ensure these are the roles your backend uses
  const BACKEND_ROLES = ["admin", "station_owner", "attendant", "regulator", "inspector", "customer"];

  if (!role) {
    // friendly message instead of immediate deny — gives next steps
    return (
      <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400">
        <h3 className="font-semibold">Role not assigned</h3>
        <p className="text-sm">
          Your account does not currently have a role assigned by the server. Please ask your system
          administrator to assign one of: {BACKEND_ROLES.join(", ")}.
        </p>
      </div>
    );
  }

  if (!BACKEND_ROLES.includes(role)) {
    return (
      <div className="p-4 text-red-600">
        Unknown role <strong>{role}</strong>. Backend roles expected: {BACKEND_ROLES.join(", ")}.
      </div>
    );
  }

  // if no allowed list => allow any authenticated user
  if (!allowed || allowed.length === 0) return children;

  if (!allowed.includes(role)) {
    return (
      <div className="p-4 text-red-600">
        Forbidden — your role <strong>{role}</strong> does not have access to this page.
      </div>
    );
  }

  return children;
}
