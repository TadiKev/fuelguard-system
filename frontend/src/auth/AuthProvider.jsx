import React, { createContext, useContext, useState, useEffect } from "react";
import api from "../api/http"; // fixed import
import {
  getAccess,
  setAccess,
  removeAccess,
  setUser,
  getUser,
  removeUser,
  decodeJwt,
  clearTokens,
} from "../utils/auth";

const AuthContext = createContext();

const ME_ENDPOINTS = [
  "me/",
  "users/me/",
  "users/me/profile/",
  "profile/me/",
  "profiles/me/",
];

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(() => getUser());
  const [loading, setLoading] = useState(true);

  const attachAccess = (token) => {
    if (token) api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    else delete api.defaults.headers.common["Authorization"];
  };

  useEffect(() => {
    (async () => {
      const token = getAccess();
      attachAccess(token);
      if (!token) {
        setLoading(false);
        return;
      }

      let got = null;
      for (const ep of ME_ENDPOINTS) {
        try {
          const res = await api.get(ep);
          if (res?.data) {
            got = res.data;
            break;
          }
        } catch {}
      }

      if (got) {
        const roleKeys = ["role", "user_role", "type"];
        if (!got.profile?.role) {
          const payload = decodeJwt(token);
          for (const k of roleKeys) {
            if (payload?.[k]) {
              got.profile = got.profile || {};
              got.profile.role = payload[k];
              break;
            }
          }
        }
      } else {
        got = getUser() || { username: "unknown" };
        if (!got.profile?.role) {
          const payload = decodeJwt(token);
          got.profile = got.profile || {};
          got.profile.role =
            payload?.role || payload?.user_role || payload?.type || null;
        }
      }

      const normalized = normalizeUserObject(got);
      setUserState(normalized);
      setUser(normalized);

      setLoading(false);
    })();
  }, []);

  const login = async (username, password) => {
    const tokenResp = await api.post("token/", { username, password });
    const { access, refresh } = tokenResp.data;
    setAccess(access, refresh);
    attachAccess(access);

    let got = null;
    for (const ep of ME_ENDPOINTS) {
      try {
        const res = await api.get(ep);
        if (res?.data) {
          got = res.data;
          break;
        }
      } catch {}
    }

    if (!got) {
      const payload = decodeJwt(access);
      got = { username };
      got.profile = got.profile || {};
      got.profile.role = payload?.role || payload?.user_role || payload?.type || null;
    }

    const normalized = normalizeUserObject(got);
    setUserState(normalized);
    setUser(normalized);
    return normalized;
  };

  const register = async (payload) => {
    const resp = await api.post("register/", payload);
    return resp.data;
  };

  const logout = () => {
    clearTokens();
    attachAccess(null);
    setUserState(null);
  };

  const getAccessToken = () => getAccess();

  return (
    <AuthContext.Provider
      value={{ user, loading, api, login, logout, register, getAccessToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function normalizeUserObject(raw) {
  if (!raw) return null;

  const out = { ...raw };
  if (raw.user && typeof raw.user === "object") Object.assign(out, raw.user);
  else if (raw.data && typeof raw.data === "object") Object.assign(out, raw.data);

  out.profile = out.profile || {};
  if (!out.profile.role) {
    for (const k of ["role", "user_role", "type"]) {
      if (out.profile[k]) {
        out.profile.role = out.profile[k];
        break;
      }
    }
  }
  if (!out.profile.role) out.profile.role = null;

  return out;
}

export const useAuth = () => useContext(AuthContext);

export default AuthProvider;
