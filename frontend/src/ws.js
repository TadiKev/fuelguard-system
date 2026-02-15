// src/ws.js
export default function createStationsWS({ onOpen, onMessage, onClose, onError, getToken }) {
  let ws = null;
  let reconnectTimer = null;

  function connect() {
    const token = typeof getToken === "function" ? getToken() : null;
    const url = `ws://localhost:8000/ws/stations/${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    ws = new WebSocket(url);

    ws.onopen = (ev) => {
      if (onOpen) onOpen(ev);
    };

    ws.onmessage = (ev) => {
      if (onMessage) {
        try {
          onMessage(JSON.parse(ev.data));
        } catch (e) {
          onMessage(ev.data);
        }
      }
    };

    ws.onerror = (err) => {
      if (onError) onError(err);
    };

    ws.onclose = (ev) => {
      if (onClose) onClose(ev);
      // reconnect with backoff
      if (!ev.wasClean) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 2000);
      }
    };
  }

  connect();

  return {
    close() {
      if (ws) ws.close();
      clearTimeout(reconnectTimer);
    },
    send(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
      }
    },
  };
}
