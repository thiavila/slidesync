let ws = null;
let currentRoomCode = null;

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
    // Capture the visible tab as screenshot
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: "jpeg", quality: 70 },
      (imageData) => {
        if (chrome.runtime.lastError) {
          console.warn("[Slide Sync] Capture error:", chrome.runtime.lastError.message);
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
          console.log("[Slide Sync] Sent slide", message.slideNumber);

          // Update storage for popup display
          chrome.storage.local.set({ currentSlide: message.slideNumber });
        }
      }
    );
  }

  return true;
});

function connectWebSocket(wsUrl, roomCode) {
  disconnectWebSocket();

  currentRoomCode = roomCode;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("[Slide Sync] WebSocket connected to room:", roomCode);
  };

  ws.onclose = () => {
    console.log("[Slide Sync] WebSocket disconnected");
    ws = null;
  };

  ws.onerror = (err) => {
    console.error("[Slide Sync] WebSocket error:", err);
  };
}

function disconnectWebSocket() {
  if (ws) {
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
