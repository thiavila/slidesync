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
async function patchQRArea(pngDataUrl, qrRect) {
  if (!qrRect.mask) {
    console.warn("[slidesync] patch skipped: no mask in qrRect");
    return pngDataUrl;
  }

  const [frameBlob, maskBlob] = await Promise.all([
    fetch(pngDataUrl).then((r) => r.blob()),
    fetch(qrRect.mask).then((r) => r.blob()),
  ]);
  const [frameBitmap, maskBitmap] = await Promise.all([
    createImageBitmap(frameBlob),
    createImageBitmap(maskBlob),
  ]);

  const canvas = new OffscreenCanvas(frameBitmap.width, frameBitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(frameBitmap, 0, 0);
  frameBitmap.close();

  const W = canvas.width;
  const H = canvas.height;

  // Map normalized rect to bitmap pixels. The captured frame's dimensions
  // are the viewport scaled by DPR, so the same fractions that describe
  // the overlay in the CSS viewport describe it in the captured bitmap.
  const x = qrRect.x * W;
  const y = qrRect.y * H;
  const w = qrRect.width * W;
  const h = qrRect.height * H;

  console.log(
    "[slidesync] Patching QR area",
    `dst=(${x.toFixed(1)},${y.toFixed(1)},${w.toFixed(1)},${h.toFixed(1)})`,
    `mask=${maskBitmap.width}x${maskBitmap.height}`,
    `frame=${W}x${H}`,
  );

  // The QR was drawn on screen via CSS mix-blend-mode: difference, so each
  // pixel under the overlay became |slide - qr|. Drawing the same QR mask
  // back with the same op gives ||slide - qr| - qr|, which equals the
  // original `slide` whenever qr is 0 (transparent → no-op) or 255 (white
  // module → exact recovery). The identity ONLY holds for those two
  // values — anti-aliased edges with intermediate values (e.g., 178)
  // don't cancel and leave a faint module outline.
  //
  // Both sides have to agree on nearest-neighbor scaling for this to work
  // pixel-exact. The on-screen overlay uses `image-rendering: pixelated`
  // which forces nearest-neighbor when CSS scales 148 CSS px → ~296
  // device px. Here we mirror that: smoothing OFF so the mask scales the
  // same way when we draw it back at the captured frame's device pixel
  // dimensions.
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "difference";
  ctx.drawImage(maskBitmap, x, y, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;
  maskBitmap.close();

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
