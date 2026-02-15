// src/services/api.js
// Unified axios client that always attaches a Bearer token (if present)
// and exposes helper functions to read/write the token.

import axios from "axios";

export const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1/").replace(/\/+$/, "/");

// list of common localStorage keys we may use across your app
const TOKEN_KEYS = ["fg_access", "access", "token", "auth_access"];

// Try multiple places for an access token (localStorage keys). Keeps this robust.
export function getStoredAccess() {
  for (const k of TOKEN_KEYS) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return null;
}

export function setStoredAccess(token, key = "fg_access") {
  if (!token) return;
  // store on first TOKEN_KEYS slot and also canonical key
  localStorage.setItem(key, token);
  // also set a canonical 'access' in case other code reads it
  try { localStorage.setItem("access", token); } catch {}
}

export function clearStoredAccess() {
  for (const k of TOKEN_KEYS) {
    localStorage.removeItem(k);
  }
}

// create axios instance
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 20000,
});

// Attach Authorization header on every request if token available.
// This is the essential fix for your 401 issue.
api.interceptors.request.use(
  (config) => {
    // if header already set by caller, do not override
    if (!config.headers) config.headers = {};
    if (!config.headers.Authorization && !config.headers.authorization) {
      const token = getStoredAccess();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (err) => Promise.reject(err)
);

// OPTIONAL: simple retry on 401 could be added here to try refresh flow.
// For now we surface the 401 so you can see token issues clearly.

export default api;
