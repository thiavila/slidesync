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
  // Custom precise position (0..100), proportional placement model: 0/0 hugs
  // top-left, 100/100 hugs bottom-right, 50/50 centers — never off screen.
  // Used only when qrPosition === "custom". Persisted in chrome.storage.local.
  let qrCustomX = 100;
  let qrCustomY = 0;
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

  // React to storage changes from any source: in-drawer click, popup,
  // other tab. Same path for every origin — single source of truth.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let needsRender = false;
    let settingsChanged = false;
    if (changes.qrEnabled)  { qrEnabled = !!changes.qrEnabled.newValue; needsRender = true; settingsChanged = true; }
    if (changes.qrPosition) { qrPosition = changes.qrPosition.newValue || "top-right"; needsRender = true; settingsChanged = true; }
    if (changes.qrCustomX)  { if (typeof changes.qrCustomX.newValue === "number") qrCustomX = changes.qrCustomX.newValue; needsRender = true; settingsChanged = true; }
    if (changes.qrCustomY)  { if (typeof changes.qrCustomY.newValue === "number") qrCustomY = changes.qrCustomY.newValue; needsRender = true; settingsChanged = true; }
    if (changes.roomCode)   { activeRoomCode = changes.roomCode.newValue || null; needsRender = true; }
    if (changes.isActive && !changes.isActive.newValue) { activeRoomCode = null; needsRender = true; }
    if (settingsChanged) syncDrawerSettings();
    if (needsRender) renderOverlayQR();
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
    if (qrPosition === "custom") {
      // Proportional placement, pure CSS (no measurement, resize-proof):
      // left = X% of the viewport, then translate by -X% of the QR's own size.
      // getBoundingClientRect (used by getQRRect) reports the post-transform
      // rect, so capture stays aligned.
      overlay.style.left = qrCustomX + "%";
      overlay.style.top = qrCustomY + "%";
      overlay.style.right = "";
      overlay.style.bottom = "";
      overlay.style.transform = `translate(${-qrCustomX}%, ${-qrCustomY}%)`;
    } else {
      overlay.style.left = "";
      overlay.style.top = "";
      overlay.style.right = "";
      overlay.style.bottom = "";
      overlay.style.transform = "";
    }

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
      <div class="slidesync-drawer" toggle>
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

          <div class="slidesync-settings" id="slidesync-settings">
            <div class="slidesync-setting-label">${msg("qrCodeLabel")}</div>
            <div class="slidesync-segmented" data-count="2" data-active-index="0" id="slidesync-qr-enabled-group">
              <button type="button" class="slidesync-seg" data-value="off">${msg("qrColorOff")}</button>
              <button type="button" class="slidesync-seg" data-value="on">${msg("qrCodeOn")}</button>
            </div>
            <div class="slidesync-segmented positions" data-count="4" data-active-index="1" id="slidesync-qr-position-group">
              <button type="button" class="slidesync-seg" data-value="top-left" title="${msg("qrPositionTopLeft")}" aria-label="${msg("qrPositionTopLeft")}">
                <span class="slidesync-pos-icon"><span class="slidesync-dot-tl"></span></span>
              </button>
              <button type="button" class="slidesync-seg" data-value="top-right" title="${msg("qrPositionTopRight")}" aria-label="${msg("qrPositionTopRight")}">
                <span class="slidesync-pos-icon"><span class="slidesync-dot-tr"></span></span>
              </button>
              <button type="button" class="slidesync-seg" data-value="bottom-left" title="${msg("qrPositionBottomLeft")}" aria-label="${msg("qrPositionBottomLeft")}">
                <span class="slidesync-pos-icon"><span class="slidesync-dot-bl"></span></span>
              </button>
              <button type="button" class="slidesync-seg" data-value="bottom-right" title="${msg("qrPositionBottomRight")}" aria-label="${msg("qrPositionBottomRight")}">
                <span class="slidesync-pos-icon"><span class="slidesync-dot-br"></span></span>
              </button>
            </div>
            <button type="button" class="slidesync-adv-toggle" id="slidesync-qr-adv-toggle" aria-expanded="false">
              <span class="slidesync-adv-caret">&#9654;</span> ${msg("qrAdvanced")}
            </button>
            <div class="slidesync-adv-panel" id="slidesync-qr-adv-panel" hidden>
              <div class="slidesync-adv-thumb" id="slidesync-qr-thumb" title="${msg("qrAdvanced")}">
                <div class="slidesync-adv-marker" id="slidesync-qr-marker"></div>
              </div>
              <div class="slidesync-adv-fields">
                <div class="slidesync-adv-field">
                  <label for="slidesync-qr-x">X</label>
                  <input type="number" id="slidesync-qr-x" min="0" max="100" step="1" inputmode="numeric"><span class="slidesync-adv-unit">%</span>
                </div>
                <div class="slidesync-adv-field">
                  <label for="slidesync-qr-y">Y</label>
                  <input type="number" id="slidesync-qr-y" min="0" max="100" step="1" inputmode="numeric"><span class="slidesync-adv-unit">%</span>
                </div>
              </div>
            </div>
            <div class="slidesync-qr-warning" id="slidesync-qr-warning">${msg("qrWarning")}</div>
          </div>

          <div class="slidesync-footer">
            <div class="slidesync-sponsor">
              ${msg("sponsorMessage")}
              <a href="https://github.com/sponsors/thiavila" target="_blank">&#9829; ${msg("sponsorCta")}</a>
            </div>
            <div class="slidesync-version">slidesync v2.6 · Reveal mode</div>
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

    // QR overlay segmented controls — handlers only write to storage. The
    // storage.onChanged listener (registered at IIFE top level) is what
    // actually updates state + UI. This makes external changes (popup,
    // other tab) flow through the same render path as in-drawer clicks.
    document.querySelectorAll("#slidesync-qr-enabled-group .slidesync-seg").forEach((b) => {
      b.addEventListener("click", () => {
        chrome.storage.local.set({ qrEnabled: b.dataset.value === "on" });
      });
    });
    document.querySelectorAll("#slidesync-qr-position-group .slidesync-seg").forEach((b) => {
      b.addEventListener("click", () => {
        chrome.storage.local.set({ qrPosition: b.dataset.value });
      });
    });

    // Advanced (custom) position — collapsible drag-pad + X/Y number inputs,
    // kept in sync. A live drag renders locally for smoothness and persists
    // once on release / input commit (a storage write per pointermove would be
    // janky and hit write quotas); the onChanged path handles external changes.
    const advToggle = document.getElementById("slidesync-qr-adv-toggle");
    const advPanel = document.getElementById("slidesync-qr-adv-panel");
    if (advToggle && advPanel) {
      advToggle.addEventListener("click", () => {
        const open = advPanel.hasAttribute("hidden");
        advPanel.toggleAttribute("hidden", !open);
        advToggle.setAttribute("aria-expanded", String(open));
      });
    }
    const clampPct = (v) => Math.max(0, Math.min(100, v));
    function applyCustomLocal() {
      qrPosition = "custom";
      renderOverlayQR();
      syncDrawerSettings();
    }
    function persistCustom() {
      chrome.storage.local.set({ qrPosition: "custom", qrCustomX, qrCustomY });
    }
    const xInput = document.getElementById("slidesync-qr-x");
    const yInput = document.getElementById("slidesync-qr-y");
    if (xInput) {
      xInput.addEventListener("input", () => { qrCustomX = clampPct(parseFloat(xInput.value) || 0); applyCustomLocal(); });
      xInput.addEventListener("change", persistCustom);
    }
    if (yInput) {
      yInput.addEventListener("input", () => { qrCustomY = clampPct(parseFloat(yInput.value) || 0); applyCustomLocal(); });
      yInput.addEventListener("change", persistCustom);
    }
    const thumb = document.getElementById("slidesync-qr-thumb");
    const marker = document.getElementById("slidesync-qr-marker");
    if (thumb && marker) {
      let dragging = false;
      const setFromPointer = (clientX, clientY) => {
        const r = thumb.getBoundingClientRect();
        const mw = marker.offsetWidth, mh = marker.offsetHeight;
        const availX = r.width - mw, availY = r.height - mh;
        qrCustomX = clampPct(availX > 0 ? ((clientX - r.left - mw / 2) / availX) * 100 : 0);
        qrCustomY = clampPct(availY > 0 ? ((clientY - r.top - mh / 2) / availY) * 100 : 0);
        applyCustomLocal();
      };
      thumb.addEventListener("pointerdown", (e) => { dragging = true; thumb.setPointerCapture(e.pointerId); setFromPointer(e.clientX, e.clientY); });
      thumb.addEventListener("pointermove", (e) => { if (dragging) setFromPointer(e.clientX, e.clientY); });
      const endDrag = () => { if (dragging) { dragging = false; persistCustom(); } };
      thumb.addEventListener("pointerup", endDrag);
      thumb.addEventListener("pointercancel", endDrag);
    }

    // Show drawer briefly on load
    container.setAttribute("active", "");
    hideTimeout = setTimeout(() => {
      container.removeAttribute("active");
    }, 4000);

    // Session/QR-state restore is performed once in init() (after both
    // injectDrawer + injectQROverlay have run), via a single consolidated
    // storage read — do not duplicate it here.
  }

  function syncDrawerSettings() {
    const enabledValue = qrEnabled ? "on" : "off";
    const enabledGroup = document.getElementById("slidesync-qr-enabled-group");
    if (enabledGroup) {
      let idx = 0;
      enabledGroup.querySelectorAll(".slidesync-seg").forEach((b, i) => {
        const isActive = b.dataset.value === enabledValue;
        b.classList.toggle("active", isActive);
        if (isActive) idx = i;
      });
      enabledGroup.setAttribute("data-active-index", String(idx));
    }
    const isCustom = qrPosition === "custom";
    const posGroup = document.getElementById("slidesync-qr-position-group");
    if (posGroup) {
      let idx = 0;
      posGroup.querySelectorAll(".slidesync-seg").forEach((b, i) => {
        const isActive = b.dataset.value === qrPosition;
        b.classList.toggle("active", isActive);
        if (isActive) idx = i;
      });
      posGroup.setAttribute("data-active-index", String(idx));
      // No corner matches a custom position — fade the sliding pill out.
      posGroup.classList.toggle("no-active", isCustom);
    }
    // Reflect the custom slot in the advanced controls (marker + number
    // inputs); flag the toggle active when custom is in use. Don't clobber an
    // input the user is actively typing into.
    const advToggleEl = document.getElementById("slidesync-qr-adv-toggle");
    if (advToggleEl) advToggleEl.classList.toggle("active", isCustom);
    const xInputEl = document.getElementById("slidesync-qr-x");
    const yInputEl = document.getElementById("slidesync-qr-y");
    if (xInputEl && document.activeElement !== xInputEl) xInputEl.value = String(Math.round(qrCustomX));
    if (yInputEl && document.activeElement !== yInputEl) yInputEl.value = String(Math.round(qrCustomY));
    const markerEl = document.getElementById("slidesync-qr-marker");
    if (markerEl) {
      markerEl.style.left = qrCustomX + "%";
      markerEl.style.top = qrCustomY + "%";
      markerEl.style.transform = `translate(${-qrCustomX}%, ${-qrCustomY}%)`;
    }
    // Show the small "may leave a faint mark" warning only while the
    // overlay is on. It's an inline note, not a toast — persistent
    // while On so the user always knows what to expect.
    const warning = document.getElementById("slidesync-qr-warning");
    if (warning) warning.style.display = qrEnabled ? "block" : "none";
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
    activeRoomCode = roomCode;
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
    renderOverlayQR();
  }

  function applyInactiveUI() {
    sessionActive = false;
    activeRoomCode = null;
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
    renderOverlayQR();
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

    // Single consolidated storage read — hydrates session + QR-overlay
    // state in one shot so syncDrawerSettings + renderOverlayQR see
    // consistent values. applyActiveUI handles the session-DOM updates
    // (including activeRoomCode = roomCode and renderOverlayQR()) so the
    // trailing renderOverlayQR() here is mostly defensive for the
    // inactive-session path.
    chrome.storage.local.get(
      ["roomCode", "isActive", "qrEnabled", "qrPosition", "qrCustomX", "qrCustomY"],
      (result) => {
        qrEnabled = !!result.qrEnabled;
        qrPosition = result.qrPosition || "top-right";
        if (typeof result.qrCustomX === "number") qrCustomX = result.qrCustomX;
        if (typeof result.qrCustomY === "number") qrCustomY = result.qrCustomY;
        if (result.isActive && result.roomCode) {
          applyActiveUI(result.roomCode);
        }
        syncDrawerSettings();
        renderOverlayQR();
        // If the saved position is custom, open the advanced panel so the
        // restored drag-pad + values are visible without an extra click.
        if (qrPosition === "custom") {
          const advPanel = document.getElementById("slidesync-qr-adv-panel");
          const advToggle = document.getElementById("slidesync-qr-adv-toggle");
          if (advPanel) advPanel.removeAttribute("hidden");
          if (advToggle) advToggle.setAttribute("aria-expanded", "true");
        }
      },
    );

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
