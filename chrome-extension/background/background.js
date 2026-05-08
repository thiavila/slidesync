let ws = null;
let currentRoomCode = null;
let currentWsUrl = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "start-session") {
    connectWebSocket(message.wsUrl, message.roomCode);
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "stop-session") {
    disconnectWebSocket();
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "capture-slide") {
    handleCaptureSlide(message, sender);
    return; // fire-and-forget; no callback to coordinate now
  }
});

async function handleCaptureSlide(message, sender) {
  if (!ws) {
    console.warn("[slidesync] capture-slide skipped: no WebSocket");
    return;
  }
  if (ws.readyState !== WebSocket.OPEN) {
    console.warn("[slidesync] capture-slide skipped: WebSocket not open, state=", ws.readyState);
    return;
  }

  // Only capture if presenter tab is active
  let tab;
  try {
    tab = await new Promise((resolve, reject) => {
      chrome.tabs.get(sender.tab.id, (t) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(t);
      });
    });
  } catch (e) {
    console.warn("[slidesync] tabs.get error:", e.message);
    return;
  }
  if (!tab.active) {
    console.warn("[slidesync] capture-slide skipped: presenter tab not active");
    return;
  }

  const imageData = await new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: "jpeg", quality: 70 },
      (data) => {
        if (chrome.runtime.lastError) {
          console.warn("[slidesync] Capture error:", chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(data);
        }
      }
    );
  });
  if (!imageData) return;

  let outImage = imageData;
  if (message.qrRect) {
    try {
      outImage = await patchQRArea(imageData, message.qrRect);
    } catch (e) {
      console.warn("[slidesync] QR patch failed, sending raw frame:", e);
    }
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "slide-update",
        slideNumber: message.slideNumber,
        imageData: outImage,
      })
    );
    console.log(
      "[slidesync] Sent slide", message.slideNumber,
      `(${(outImage.length / 1024).toFixed(0)} KB${message.qrRect ? " patched" : ""})`,
    );
    chrome.storage.local.set({ currentSlide: message.slideNumber });
  }
}

// Edge-stretch patch: replace the QR rectangle in the captured image with
// a vertical extrusion of the slide pixels right above (or below) it.
//
// For corner-positioned QRs the strip taken from the slide-facing edge
// is bilinearly stretched across the QR area by drawImage's resampling.
// On slides with solid or gradient backgrounds near the corner, the patch
// is essentially invisible. On busy photo backgrounds it shows up as a
// soft vertical smudge — much more natural than a flat color box.
async function patchQRArea(jpegDataUrl, qrRect) {
  const blob = await fetch(jpegDataUrl).then((r) => r.blob());
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const W = canvas.width;
  const H = canvas.height;

  // Clamp normalized rect onto the actual image
  const x = Math.max(0, Math.floor(qrRect.x * W));
  const y = Math.max(0, Math.floor(qrRect.y * H));
  const w = Math.min(W - x, Math.ceil(qrRect.width * W));
  const h = Math.min(H - y, Math.ceil(qrRect.height * H));
  if (w <= 0 || h <= 0) {
    return await canvasToDataUrl(canvas);
  }

  // Pick the source row from the side facing the slide center.
  // bottom-* corner → row above the QR; top-* corner → row below.
  const isBottom = typeof qrRect.position === "string" && qrRect.position.startsWith("bottom");
  const sourceY = isBottom
    ? Math.max(0, y - 1)
    : Math.min(H - 1, y + h);

  // drawImage resamples the 1-row source up to the full QR height —
  // that's the entire trick, the browser does the bilinear stretch for us.
  ctx.drawImage(
    canvas,
    x, sourceY, w, 1, // src
    x, y, w, h,       // dst
  );

  return await canvasToDataUrl(canvas);
}

async function canvasToDataUrl(canvas) {
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function connectWebSocket(wsUrl, roomCode) {
  if (ws) {
    ws.onclose = null;
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
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  currentRoomCode = null;
}

chrome.storage.local.get(["wsUrl", "roomCode", "isActive"], (result) => {
  if (result.isActive && result.wsUrl && result.roomCode) {
    connectWebSocket(result.wsUrl, result.roomCode);
  }
});
