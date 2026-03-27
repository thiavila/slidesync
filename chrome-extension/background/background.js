let ws = null;
let currentRoomCode = null;
let currentWsUrl = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "start-session") {
    connectWebSocket(message.wsUrl, message.roomCode);
    sendResponse({ ok: true });
  }

  if (message.type === "stop-session") {
    disconnectWebSocket();
    sendResponse({ ok: true });
  }

  if (message.type === "capture-slide") {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Only capture if the presentation tab is the active tab in its window
    chrome.tabs.get(sender.tab.id, (tab) => {
      if (chrome.runtime.lastError || !tab.active) return;

      chrome.tabs.captureVisibleTab(
        sender.tab.windowId,
        { format: "jpeg", quality: 70 },
        (imageData) => {
          if (chrome.runtime.lastError) {
            console.warn("[slidesync] Capture error:", chrome.runtime.lastError.message);
            return;
          }

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "slide-update",
                slideNumber: message.slideNumber,
                imageData: imageData,
              })
            );
            console.log("[slidesync] Sent slide", message.slideNumber);
            chrome.storage.local.set({ currentSlide: message.slideNumber });
          }
        }
      );
    });
  }

  return true;
});

function connectWebSocket(wsUrl, roomCode) {
  if (ws) {
    ws.onclose = null; // prevent reconnect from old socket
    ws.close();
    ws = null;
  }

  currentRoomCode = roomCode;
  currentWsUrl = wsUrl;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    reconnectAttempts = 0;
    console.log("[slidesync] WebSocket connected to room:", roomCode);
  };

  ws.onclose = () => {
    console.log("[slidesync] WebSocket disconnected");
    ws = null;
    if (currentWsUrl && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
      reconnectAttempts++;
      console.log(`[slidesync] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      setTimeout(() => connectWebSocket(currentWsUrl, currentRoomCode), delay);
    }
  };

  ws.onerror = (err) => {
    console.error("[slidesync] WebSocket error:", err);
  };
}

function disconnectWebSocket() {
  currentWsUrl = null;
  reconnectAttempts = 0;
  if (ws) {
    ws.onclose = null; // prevent auto-reconnect on intentional disconnect
    ws.close();
    ws = null;
  }
  currentRoomCode = null;
}

// Restore connection on service worker startup
chrome.storage.local.get(["wsUrl", "roomCode", "isActive"], (result) => {
  if (result.isActive && result.wsUrl && result.roomCode) {
    connectWebSocket(result.wsUrl, result.roomCode);
  }
});
