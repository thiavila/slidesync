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
      // PNG, lossless. JPEG quantization noise around the QR's high-contrast
      // module edges was leaving a visible ghost after the inversion math —
      // PNG eliminates that variable entirely. Frames are bigger but
      // PartyKit handles them fine.
      { format: "png" },
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
  } else {
    console.log("[slidesync] capture-slide: no qrRect, sending raw frame");
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

// Inverse-blend patch: the on-screen QR is drawn with white modules and
// mix-blend-mode: difference, so each dark-module pixel ends up as
// (255 - slide_pixel) on screen — exactly what captureVisibleTab grabs.
// We know which modules are dark (the matrix is shipped with the message),
// so we walk the QR rectangle and invert every dark-module pixel back to
// (255 - captured) = original slide pixel. Light modules pass through
// untouched. Result: clean slide with the QR mathematically removed,
// no edge-stretch smudge, no color-fill artifacts.
async function patchQRArea(jpegDataUrl, qrRect) {
  if (!qrRect.matrix || !qrRect.matrix.length) {
    console.warn("[slidesync] patch skipped: no matrix in qrRect", qrRect);
    return jpegDataUrl;
  }
  // Sanity-count: how many cells in the matrix are actually marked dark.
  // If this is 0 the matrix shipped fine but is the wrong format string
  // (e.g. all "0"s, or chars other than "1"); if it's tiny vs N*N something
  // is off in the lib's _oQRCode. Typical QR is ~40-50% dark.
  let darkCount = 0;
  for (let r = 0; r < qrRect.matrix.length; r++) {
    const row = qrRect.matrix[r];
    for (let c = 0; c < row.length; c++) {
      if (row.charCodeAt(c) === 49) darkCount++;
    }
  }
  console.log(
    "[slidesync] Patching QR area",
    `pos=(${qrRect.x.toFixed(3)},${qrRect.y.toFixed(3)})`,
    `size=(${qrRect.width.toFixed(3)},${qrRect.height.toFixed(3)})`,
    `matrix=${qrRect.matrix.length}x${qrRect.matrix.length}`,
    `dark=${darkCount}/${qrRect.matrix.length * qrRect.matrix.length}`,
  );

  const blob = await fetch(jpegDataUrl).then((r) => r.blob());
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const W = canvas.width;
  const H = canvas.height;

  const x = Math.max(0, Math.floor(qrRect.x * W));
  const y = Math.max(0, Math.floor(qrRect.y * H));
  const w = Math.min(W - x, Math.ceil(qrRect.width * W));
  const h = Math.min(H - y, Math.ceil(qrRect.height * H));
  if (w <= 0 || h <= 0) return await canvasToDataUrl(canvas);

  const matrix = qrRect.matrix;
  const N = matrix.length;
  if (N === 0) return await canvasToDataUrl(canvas);

  const cellW = w / N;
  const cellH = h / N;

  // Pre-compute per-row "is dark" lookup as Uint8Array for tight inner loop
  const dark = new Uint8Array(N * N);
  for (let r = 0; r < N; r++) {
    const row = matrix[r];
    for (let c = 0; c < N && c < row.length; c++) {
      if (row.charCodeAt(c) === 49 /* "1" */) dark[r * N + c] = 1;
    }
  }

  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;

  for (let py = 0; py < h; py++) {
    const cellR = Math.min(N - 1, Math.floor(py / cellH));
    const rowBase = cellR * N;
    for (let px = 0; px < w; px++) {
      const cellC = Math.min(N - 1, Math.floor(px / cellW));
      if (dark[rowBase + cellC]) {
        const i = (py * w + px) * 4;
        data[i]     = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
        // alpha untouched
      }
    }
  }

  ctx.putImageData(imageData, x, y);
  return await canvasToDataUrl(canvas);
}

async function canvasToDataUrl(canvas) {
  // PNG (lossless) so the patched corner doesn't pick up a JPEG ringing halo
  // around the dark/light module boundaries on the way out.
  const blob = await canvas.convertToBlob({ type: "image/png" });
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
