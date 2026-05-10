// slidesync.live/present/ — Reveal mode handler.
// Injects the slidesync drawer, listens for Reveal nav events from the
// embedded iframe (parent.postMessage), and uses the existing background
// capture-slide flow to broadcast frames to students.
//
// The web app's only job is to render the Reveal HTML in a fullscreen
// iframe. Everything else (room code, QR, WebSocket, capture, stop)
// happens here.

(() => {
  const PARTY_SERVER = "slide-sync.thiavila.partykit.dev";
  // Use the same origin the user opened, so dev (localhost) points to dev
  // and prod points to prod. Falls back to the production URL just in case.
  const WEBAPP_URL = window.location.origin || "https://slidesync.live";
  // Time-based settle. We don't listen to Reveal's slidetransitionend or
  // CSS transitionend events because (a) fragments fire 'fragmentshown'
  // before the CSS animation, (b) hooking inside the iframe adds a second
  // bridge surface. 700ms covers the default 0.4s fragment animation and
  // 0.6s slide transition. The heartbeat catches any late settling.
  const SETTLE_MS = 700;
  const HEARTBEAT_MS = 1800;
  const VISIBLE_SOURCE = "slidesync-visible";
  const NAV_TYPE = "nav";
  const SLIDE_INDEX_TYPE = "slide-index";
  const PAGE_SOURCE = "slidesync-page";
  const EXT_SOURCE = "slidesync-extension";
  const REVEAL_IFRAME_TITLE = "Reveal presentation";

  const msg = (key) => chrome.i18n.getMessage(key) || key;

  let hideTimeout = null;
  let drawerContainer = null;

  // Per-session capture state
  let lastIdx = null;
  // Canonical slide index sent by the iframe bridge: { "h-v": globalIndex }.
  // null until the iframe finishes Reveal init and posts its layout.
  let slideIndex = null;
  let totalSlides = 0;
  let settleTimer = null;
  let heartbeatTimer = null;
  let sessionActive = false;
  let lastSlideShown = 0;

  // Persistent QR overlay state (mirrors content.js v2.3.0 Google Slides path).
  // Defaults: opt-in OFF, top-right. Hydrated from chrome.storage.local in init().
  // activeRoomCode is an intentional third source of "is there a room?" signal
  // alongside sessionActive and the DOM — don't try to unify in this plan.
  let qrEnabled = false;
  let qrPosition = "top-right";
  let activeRoomCode = null;

  function reply(payload) {
    window.postMessage({ source: EXT_SOURCE, ...payload }, "*");
  }

  console.log("[slidesync] reveal-bridge loaded on", window.location.href);

  // Announce presence so the web app can confirm the extension is installed.
  reply({ type: "ready", version: chrome.runtime.getManifest().version });

  // ---- Message routing ---------------------------------------------------
  // We receive messages from two sources:
  //   - The Reveal iframe (e.source === iframe.contentWindow) — nav events
  //   - The web app page itself (e.source === window) — ping
  // So we can't blanket-filter on e.source; we discriminate by data.source.
  window.addEventListener("message", (e) => {
    const data = e.data;
    if (!data) return;

    // Reveal iframe → us: nav events
    if (data.source === VISIBLE_SOURCE && data.type === NAV_TYPE) {
      handleNav({ h: data.h, v: data.v, f: data.f });
      return;
    }

    // Reveal iframe → us: canonical slide index (posted once Reveal is ready)
    if (data.source === VISIBLE_SOURCE && data.type === SLIDE_INDEX_TYPE) {
      slideIndex = data.map || {};
      totalSlides = data.total || 0;
      console.log("[slidesync] slide index received:", totalSlides, "slides");
      if (lastIdx) updateSlideCounter(slideNumberFor(lastIdx), totalSlides);
      return;
    }

    // Web app → us: ping for installation detection (must come from same window)
    if (e.source === window && data.source === PAGE_SOURCE && data.type === "ping") {
      reply({ type: "pong", id: data.id, version: chrome.runtime.getManifest().version });
      return;
    }
  });

  // Key by horizontal/vertical only — fragment changes update the SAME
  // slide image instead of creating new entries. Each unique h-v is a
  // slide; fragments are progressive disclosure within that slide.
  function snapKey(idx) {
    return `${idx.h}-${idx.v}`;
  }

  function slideNumberFor(idx) {
    if (slideIndex) {
      const key = snapKey(idx);
      if (slideIndex[key]) return slideIndex[key];
    }
    // Fallback: race window before slide-index arrives. Pin to 1 so we don't
    // briefly assign wrong-order numbers that the canonical map would shift.
    return 1;
  }

  function handleNav(idx) {
    lastIdx = idx;
    const n = slideNumberFor(idx);
    updateSlideCounter(n, totalSlides);
    console.log("[slidesync] nav", idx, "→ slide", n, "active=", sessionActive);

    if (!sessionActive) return;

    if (settleTimer) clearTimeout(settleTimer);
    if (heartbeatTimer) clearTimeout(heartbeatTimer);

    settleTimer = setTimeout(() => {
      capture(idx);
      scheduleHeartbeat();
    }, SETTLE_MS);
  }

  function scheduleHeartbeat() {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      if (!sessionActive || !lastIdx) return;
      capture(lastIdx);
      scheduleHeartbeat();
    }, HEARTBEAT_MS);
  }

  function capture(idx) {
    const slideNumber = slideNumberFor(idx);
    console.log("[slidesync] requesting capture for slide", slideNumber, idx);
    chrome.runtime.sendMessage({
      type: "capture-slide",
      slideNumber,
      qrRect: getQRRect(),
    });
  }

  // ---- Persistent QR overlay -------------------------------------------
  // Ported from content.js v2.3.0 initPresentMode. The overlay is painted
  // in the parent document with mix-blend-mode: difference (CSS already
  // shipped in content.css). It composites over the Reveal iframe in the
  // parent stacking context, so no iframe-side hooks are needed.

  // Compute the QR overlay's position as fractions of the viewport so the
  // background script can map it onto the captured image (which has its
  // own DPR-scaled dimensions) without us having to send any pixel math.
  function getQRRect() {
    if (!qrEnabled || !activeRoomCode) return null;
    const overlay = document.getElementById("slidesync-qr-overlay");
    if (!overlay) return null;
    const r = overlay.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw === 0 || vh === 0) return null;
    // Grab the actual rendered canvas pixels of the QR. This is what the
    // browser composited onto the slide via mix-blend-mode: difference.
    // Drawing the same image back over the captured frame with the same
    // difference op cancels the blend — pixel-perfect, no matrix math,
    // no cell alignment, no DPR juggling.
    const cv = overlay.querySelector("canvas");
    let maskDataUrl = null;
    if (cv) {
      try {
        maskDataUrl = cv.toDataURL("image/png");
      } catch (e) {
        console.warn("[slidesync] toDataURL failed:", e);
      }
    }
    return {
      x: r.left / vw,
      y: r.top / vh,
      width: r.width / vw,
      height: r.height / vh,
      mask: maskDataUrl,
    };
  }

  function injectQROverlay() {
    const overlay = document.createElement("div");
    overlay.className = "slidesync-qr-overlay";
    overlay.id = "slidesync-qr-overlay";
    overlay.setAttribute("data-color", "off");
    overlay.setAttribute("data-position", "top-right");
    overlay.innerHTML = `<div class="slidesync-qr-canvas" id="slidesync-qr-canvas"></div>`;
    document.body.appendChild(overlay);
  }

  function renderOverlayQR() {
    const overlay = document.getElementById("slidesync-qr-overlay");
    if (!overlay) return;
    overlay.setAttribute("data-position", qrPosition);

    const canvas = document.getElementById("slidesync-qr-canvas");
    if (!canvas) return;

    if (!activeRoomCode || !qrEnabled) {
      overlay.setAttribute("data-active", "false");
      canvas.innerHTML = "";
      return;
    }
    overlay.setAttribute("data-active", "true");

    const sessionUrl = `${WEBAPP_URL}/session/${activeRoomCode}`;

    canvas.innerHTML = "";
    const cv = buildQRCanvas(sessionUrl);
    if (cv) {
      canvas.appendChild(cv);
      console.log(
        "[slidesync] QR rendered",
        `buffer=${cv.width}x${cv.height} device px`,
        `display=${cv.style.width}`,
        `dpr=${window.devicePixelRatio}`,
      );
    } else {
      console.warn("[slidesync] QR build failed");
    }
  }

  // Build the QR mask canvas at exactly device pixel resolution. This is
  // the key trick that makes the difference-blend cancellation exact on
  // any DPR (including fractional 1.25/1.5/1.75): canvas internal buffer
  // is sized to integer device pixels; CSS displays it at canvas/DPR so
  // there's no on-screen scaling at all (1 canvas pixel = 1 device pixel).
  // The patcher then draws the same canvas at the same device dimensions,
  // also no scaling — both sides see identical 0/255 pixel values, and
  // ||slide−qr|−qr| = slide cancels perfectly.
  //
  // Bonus: rendering manually (instead of letting the QR lib do it) lets
  // us inset each dark module by 1 device pixel so the QR has airy gaps
  // between modules — visually finer lines, same scan reliability.
  function buildQRCanvas(text) {
    const dpr = window.devicePixelRatio || 1;

    // Use the lib only as an encoder — we extract the dark/light matrix
    // and ignore the canvas it draws.
    const tmp = document.createElement("div");
    tmp.style.cssText = "position:absolute;left:-9999px;visibility:hidden;width:0;height:0;overflow:hidden";
    document.body.appendChild(tmp);
    let matrix = null;
    try {
      const qr = new QRCode(tmp, {
        text,
        width: 100,
        height: 100,
        correctLevel: QRCode.CorrectLevel.H,
      });
      const model = qr && qr._oQRCode;
      if (model && typeof model.getModuleCount === "function" && typeof model.isDark === "function") {
        const n = model.getModuleCount();
        const m = new Array(n);
        for (let r = 0; r < n; r++) {
          const row = new Uint8Array(n);
          for (let c = 0; c < n; c++) row[c] = model.isDark(r, c) ? 1 : 0;
          m[r] = row;
        }
        matrix = m;
      }
    } catch (e) {
      console.warn("[slidesync] QR encode failed:", e);
    }
    document.body.removeChild(tmp);
    if (!matrix) return null;

    const N = matrix.length;
    // Aim for ~3 CSS px per module (= ~111 CSS px for N=37). Round
    // pxPerModule to an integer in DEVICE px so each module lands on
    // whole canvas pixels — required for the cancellation to stay exact.
    const pxPerModule = Math.max(3, Math.round(3 * dpr));
    const canvasSize = pxPerModule * N;
    // Inset 1 device px when there's room, leaving a 1px gap between
    // modules. Visually thinner lines without breaking phone scans
    // (scanners read module centers; 1-px breathing room is fine for
    // pxPerModule >= 5; below that we keep modules solid).
    const inset = pxPerModule >= 5 ? 1 : 0;
    const dotSize = pxPerModule - inset * 2;

    const cv = document.createElement("canvas");
    cv.width = canvasSize;
    cv.height = canvasSize;
    // Fractional CSS size is fine — the browser layouts to the float
    // and getBoundingClientRect returns the float, so the patcher's
    // rect math stays consistent.
    const cssSize = canvasSize / dpr;
    cv.style.width = cssSize + "px";
    cv.style.height = cssSize + "px";

    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff";
    for (let r = 0; r < N; r++) {
      const row = matrix[r];
      for (let c = 0; c < N; c++) {
        if (row[c]) {
          ctx.fillRect(
            c * pxPerModule + inset,
            r * pxPerModule + inset,
            dotSize,
            dotSize,
          );
        }
      }
    }
    return cv;
  }

  function updateSlideCounter(current, total) {
    lastSlideShown = current;
    const el = document.getElementById("slidesync-slide-counter");
    if (el) el.textContent = `${current} / ${total || 1}`;
  }

  // ---- Drawer injection (adapted from content.js initPresentMode) --------

  function injectDrawer() {
    if (drawerContainer) return;
    const container = document.createElement("div");
    container.className = "slidesync-drawer-container";
    container.innerHTML = `
      <div class="slidesync-mouseover-area"></div>
      <div class="slidesync-drawer">
        <div class="slidesync-toggle-btn">
          <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24">
            <path d="M0 0h24v24H0V0z" fill="none"/>
            <path d="M14.71 6.71c-.39-.39-1.02-.39-1.41 0L8.71 11.3c-.39.39-.39 1.02 0 1.41l4.59 4.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L10.83 12l3.88-3.88c.39-.39.38-1.03 0-1.41z" fill="#506173"/>
          </svg>
        </div>
        <div class="slidesync-drawer-content">
          <img src="${chrome.runtime.getURL('icons/icon128.png')}" alt="slidesync" class="slidesync-logo" />
          <div class="slidesync-title">slidesync</div>
          <div class="slidesync-subtitle">${msg("drawerSubtitle")}</div>

          <div class="slidesync-code-container">
            <div class="slidesync-code-label">${msg("roomCodeLabel")}</div>
            <div class="slidesync-code-value" id="slidesync-code">------</div>
          </div>

          <div id="slidesync-qr-section" style="display:none;">
            <div class="slidesync-hr"></div>
            <div class="slidesync-qr-container" id="slidesync-qr"></div>
            <div class="slidesync-url" id="slidesync-url"></div>
            <div class="slidesync-hr"></div>
          </div>

          <div class="slidesync-status">
            <span class="dot inactive" id="slidesync-dot"></span>
            <span id="slidesync-status">${msg("statusDisconnected")}</span>
          </div>

          <div id="slidesync-slide-counter" style="font-size: 12px; color: #777; margin-bottom: 12px; font-family: monospace;">— / —</div>

          <button primary id="slidesync-start">${msg("startSession")}</button>
          <button class="danger" id="slidesync-stop" style="display:none;">${msg("stopSession")}</button>

          <div class="slidesync-footer">
            <div class="slidesync-sponsor">
              ${msg("sponsorMessage")}
              <a href="https://github.com/sponsors/thiavila" target="_blank">&#9829; ${msg("sponsorCta")}</a>
            </div>
            <div class="slidesync-version">slidesync · Reveal mode</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);
    drawerContainer = container;

    // Mouseover area shows toggle
    container.querySelector(".slidesync-mouseover-area").addEventListener("mouseenter", () => {
      clearTimeout(hideTimeout);
      container.setAttribute("active", "");
    });

    container.querySelector(".slidesync-mouseover-area").addEventListener("mouseleave", () => {
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        container.removeAttribute("active");
      }, 1500);
    });

    container.querySelector(".slidesync-toggle-btn").addEventListener("click", () => {
      const drawer = container.querySelector(".slidesync-drawer");
      drawer.toggleAttribute("toggle");
      if (drawer.getAttribute("toggle") === null) {
        clearTimeout(hideTimeout);
        container.setAttribute("active", "");
        hideTimeout = setTimeout(() => {
          container.removeAttribute("active");
        }, 1500);
      }
    });

    document.getElementById("slidesync-start").addEventListener("click", startSession);
    document.getElementById("slidesync-stop").addEventListener("click", stopSession);

    // Show drawer briefly on load
    container.setAttribute("active", "");
    hideTimeout = setTimeout(() => {
      container.removeAttribute("active");
    }, 4000);

    // Restore an active session if one exists (e.g., after page reload)
    chrome.storage.local.get(["roomCode", "isActive"], (result) => {
      if (result.isActive && result.roomCode) {
        applyActiveUI(result.roomCode);
      }
    });
  }

  function generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  function showQRCode(roomCode) {
    const sessionUrl = `${WEBAPP_URL}/session/${roomCode}`;
    const qrSection = document.getElementById("slidesync-qr-section");
    const qrContainer = document.getElementById("slidesync-qr");
    const urlEl = document.getElementById("slidesync-url");
    if (!qrContainer || !urlEl || !qrSection) return;

    qrContainer.innerHTML = "";
    // QRCode global comes from qrcode.min.js, loaded before this script.
    new QRCode(qrContainer, {
      text: sessionUrl,
      width: 200,
      height: 200,
      colorDark: "#333333",
      colorLight: "rgba(0,0,0,0)",
      correctLevel: QRCode.CorrectLevel.M,
    });
    urlEl.textContent = sessionUrl;
    qrSection.style.display = "block";
  }

  function applyActiveUI(roomCode) {
    sessionActive = true;
    document.getElementById("slidesync-code").textContent = roomCode;
    document.getElementById("slidesync-dot").classList.remove("inactive");
    document.getElementById("slidesync-status").textContent = msg("statusActive");
    document.getElementById("slidesync-start").style.display = "none";
    document.getElementById("slidesync-stop").style.display = "block";
    showQRCode(roomCode);
    // If we already have a current Reveal position, capture immediately so
    // the first student to connect doesn't wait for the next nav.
    if (lastIdx) {
      capture(lastIdx);
      scheduleHeartbeat();
    }
  }

  function applyInactiveUI() {
    sessionActive = false;
    lastIdx = null;
    slideIndex = null;
    totalSlides = 0;
    document.getElementById("slidesync-code").textContent = "------";
    document.getElementById("slidesync-dot").classList.add("inactive");
    document.getElementById("slidesync-status").textContent = msg("statusDisconnected");
    document.getElementById("slidesync-start").style.display = "block";
    document.getElementById("slidesync-stop").style.display = "none";
    document.getElementById("slidesync-qr-section").style.display = "none";
    const qrContainer = document.getElementById("slidesync-qr");
    if (qrContainer) qrContainer.innerHTML = "";
    if (settleTimer) clearTimeout(settleTimer);
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    updateSlideCounter(0, 0);
  }

  function startSession() {
    const roomCode = generateRoomCode();
    const wsUrl = `wss://${PARTY_SERVER}/parties/main/${roomCode}`;
    chrome.storage.local.set({ roomCode, wsUrl, isActive: true });
    chrome.runtime.sendMessage({ type: "start-session", wsUrl, roomCode });
    applyActiveUI(roomCode);
  }

  function stopSession() {
    chrome.runtime.sendMessage({ type: "stop-session" });
    chrome.storage.local.remove(["roomCode", "wsUrl", "isActive"]);
    applyInactiveUI();
    // Tell the page to wipe its loaded Reveal and return to the upload view.
    reply({ type: "session-ended" });
  }

  // ---- Wait for Reveal iframe to be present ------------------------------

  function revealIframeReady() {
    return !!document.querySelector(`iframe[title="${REVEAL_IFRAME_TITLE}"]`);
  }

  function init() {
    injectDrawer();
    injectQROverlay();
    // Auto-fullscreen helpers — re-enter on click if user accidentally pressed Esc.
    let userInteracted = false;
    document.addEventListener("click", () => { userInteracted = true; }, { once: true });
    document.addEventListener("keydown", () => { userInteracted = true; }, { once: true });
    document.addEventListener("click", () => {
      if (userInteracted && !document.fullscreenElement && revealIframeReady()) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    });
  }

  // The web app renders the Reveal iframe after the user uploads an HTML
  // file. Wait for it before showing the drawer, so we don't clutter the
  // upload screen.
  function waitForRevealAndInit() {
    if (revealIframeReady()) {
      init();
      return;
    }
    const obs = new MutationObserver(() => {
      if (revealIframeReady()) {
        obs.disconnect();
        init();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForRevealAndInit);
  } else {
    waitForRevealAndInit();
  }
})();
