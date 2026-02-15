// src/services/ws.js
// Reconnecting WebSocket with station-aware URLs

export default function createStationsWS({ baseHttpUrl, stationId, getToken }) {
  let socket = null;
  let listeners = new Set();
  let closedByUser = false;
  let reconnectDelay = 500;
  let reconnectTimer = null;

  function buildUrl() {
    if (!baseHttpUrl || !stationId) return null;

    let url = baseHttpUrl.replace(/\/+$/, "");

    // http → ws
    url = url.replace(/^http:/, "ws:").replace(/^https:/, "wss:");

    let finalUrl = `${url}/ws/stations/${stationId}/`;

    const token = getToken?.();
    if (token) {
      finalUrl += `?token=${encodeURIComponent(token)}`;
    }

    return finalUrl;
  }

  function connect() {
    const wsUrl = buildUrl();
    if (!wsUrl) return;

    if (
      socket &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    )
      return;

    try {
      socket = new WebSocket(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      reconnectDelay = 500;
      listeners.forEach((l) => l({ __meta: "open" }));
    };

    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        listeners.forEach((l) => l(data));
      } catch {
        // ignore non-JSON
      }
    };

    socket.onerror = (e) => {
      listeners.forEach((l) => l({ __meta: "error", error: e }));
    };

    socket.onclose = (ev) => {
      listeners.forEach((l) => l({ __meta: "close", ev }));
      if (!closedByUser) scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(30000, Math.round(reconnectDelay * 1.8));
      connect();
    }, reconnectDelay);
  }

  connect();

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    send(obj) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(obj));
      return true;
    },
    close() {
      closedByUser = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
      socket = null;
    },
  };
}
