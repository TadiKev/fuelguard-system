// small localStorage helpers for tokens and JWT decode

const ACCESS_KEY = "access";
const REFRESH_KEY = "refresh";
const USER_KEY = "user";

/** token helpers */
export function setAccess(access, refresh) {
  if (access) localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function getAccess() {
  return localStorage.getItem(ACCESS_KEY);
}

export function removeAccess() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

/** user helpers */
export function setUser(userObj) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(userObj));
  } catch {}
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function removeUser() {
  localStorage.removeItem(USER_KEY);
}

/** ✅ single logout helper */
export function clearTokens() {
  removeAccess();
  removeUser();
}

/** decode JWT payload (base64url decode) */
export function decodeJwt(token) {
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    let b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}
