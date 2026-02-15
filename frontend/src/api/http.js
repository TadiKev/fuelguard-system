// src/api/http.js
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1/";

const TOKEN_KEY = "fg_access";
const REFRESH_KEY = "fg_refresh";

export const getStoredAccess = () => localStorage.getItem(TOKEN_KEY);
export const getStoredRefresh = () => localStorage.getItem(REFRESH_KEY);
export const setStoredTokens = ({ access, refresh }) => {
  if (access) localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
};
export const clearStoredTokens = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// attach access
api.interceptors.request.use((cfg) => {
  const token = getStoredAccess();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

let isRefreshing = false;
let subscribers = [];

function onRefreshed(token) {
  subscribers.forEach((cb) => cb(token));
  subscribers = [];
}
function addSubscriber(cb) {
  subscribers.push(cb);
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const status = err.response?.status;
    if (!original || original._retry) return Promise.reject(err);

    if (status === 401) {
      const refreshToken = getStoredRefresh();
      if (!refreshToken) return Promise.reject(err);

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          addSubscriber((token) => {
            if (!token) return reject(err);
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const r = await axios.post(`${API_BASE}token/refresh/`, { refresh: refreshToken });
        const newAccess = r.data?.access;
        if (!newAccess) throw new Error("No new access");
        setStoredTokens({ access: newAccess, refresh: refreshToken });
        api.defaults.headers.Authorization = `Bearer ${newAccess}`;
        onRefreshed(newAccess);
        original._retry = true;
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch (refreshErr) {
        clearStoredTokens();
        onRefreshed(null);
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

export default api;
