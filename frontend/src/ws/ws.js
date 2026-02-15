// src/ws/ws.js
// simple wrapper to open websocket with token query param and reconnect
export default function createStationSocket({ accessToken, onMessage, onOpen, onClose, urlBase }) {
  // urlBase, e.g. ws://localhost:8000/ws/stations/
  let ws = null;
  let closedExplicitly = false;
  let reconnectTimer = null;

  function connect() {
    const tokenPart = accessToken ? `?token=${encodeURIComponent(accessToken)}` : "";
    ws = new WebSocket(`${urlBase}${tokenPart}`);
    ws.onopen = (ev) => { onOpen?.(ev); };
    ws.onmessage = (ev) => onMessage?.(ev);
    ws.onclose = (ev) => {
      onClose?.(ev);
      if (!closedExplicitly) {
        reconnectTimer = setTimeout(connect, 1500);
      }
    };
    ws.onerror = (ev) => {
      // ignore; connection close will handle reconnect
      console.error("ws err", ev);
    };
  }

  connect();

  return {
    send: (data) => ws && ws.readyState === WebSocket.OPEN && ws.send(typeof data === "string" ? data : JSON.stringify(data)),
    close: () => {
      closedExplicitly = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}
