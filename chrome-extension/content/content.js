(() => {
  const PARTY_SERVER = "slide-sync.thiavila.partykit.dev";
  const WEBAPP_URL = "https://slidesync.live";
  const msg = (key) => chrome.i18n.getMessage(key) || key;

  const pathname = window.location.pathname;
  const isPresentPage = /\/present(\/|$)/.test(pathname);
  const isEditPage = !isPresentPage;

  console.log("[slidesync] Loading on:", window.location.href, "| Edit:", isEditPage, "| Present:", isPresentPage);

  if (isPresentPage) {
    initPresentMode();
    return;
  }

  if (isEditPage) {
    initEditMode();
    return;
  }

  // ===== PRESENT MODE =====
  function initPresentMode() {
    let lastSlide = null;
    let hideTimeout = null;
    let qrColor = "off";
    let qrPosition = "bottom-right";
    let activeRoomCode = null;

    function getSlideNumber() {
      // Use the slide counter in the toolbar (same method as Remote for Slides)
      const counter = document.querySelector(".goog-flat-menu-button-caption") ||
                      document.querySelector(".docs-material-menu-button-flat-default-caption");
      if (counter) {
        const pos = counter.getAttribute("aria-posinset");
        if (pos) return parseInt(pos, 10);
      }

      // Fallback: try hash
      const hash = window.location.hash;
      const pMatch = hash.match(/slide=id\.p(\d+)/);
      if (pMatch) {
        const num = parseInt(pMatch[1], 10);
        return num === 0 ? 1 : num;
      }
      if (/slide=id\.p$/.test(hash)) return 1;

      return lastSlide || 1;
    }

    // ----- Capture-exclusion: ref-counted hide of any slidesync UI -----
    // captureVisibleTab grabs everything visible. To keep the persistent QR
    // (and drawer) out of student snapshots, toggle a class on <html> right
    // before each capture and restore it after the background callback.
    //
    // Generation token: if the safety timer ever bumps `generation` (because
    // a capture stalled past 1500ms), any straggler callback from that older
    // capture must become a no-op — otherwise it could prematurely re-show
    // the overlay while a freshly-launched capture is still in flight, and
    // the QR would leak into the next snapshot.
    let captureInflight = 0;
    let captureGeneration = 0;
    let safetyTimer = null;

    function hideForCapture() {
      document.documentElement.classList.add("slidesync-capturing");
    }

    function showAfterCapture() {
      document.documentElement.classList.remove("slidesync-capturing");
    }

    function requestCapture(slideNumber) {
      // Only run the hide/show dance when there's actually a QR overlay
      // visible to exclude. Without this gate the heartbeat would toggle
      // .slidesync-capturing every 2s for the whole session and the drawer
      // would visibly flicker.
      const overlayVisible = qrColor !== "off" && !!activeRoomCode;
      if (!overlayVisible) {
        chrome.runtime.sendMessage(
          { type: "capture-slide", slideNumber },
          () => { void chrome.runtime.lastError; },
        );
        return;
      }

      const myGen = captureGeneration;
      captureInflight++;
      hideForCapture();

      // Safety net: if the background callback never arrives (service worker
      // tear-down, tab inactive, ws send drop, …) restore the UI within 1.5s
      // so the QR doesn't vanish permanently from the presenter's POV.
      clearTimeout(safetyTimer);
      safetyTimer = setTimeout(() => {
        captureGeneration++;       // invalidate any pending callbacks
        captureInflight = 0;
        showAfterCapture();
      }, 1500);

      // One rAF is enough — chrome.runtime.sendMessage round-trips through
      // the worker queue, which guarantees the browser paints the hidden
      // state before captureVisibleTab fires.
      requestAnimationFrame(() => {
        chrome.runtime.sendMessage(
          { type: "capture-slide", slideNumber },
          () => {
            // Read lastError to avoid unchecked-runtime-error console noise.
            void chrome.runtime.lastError;
            if (myGen !== captureGeneration) return; // stale, safety already fired
            if (--captureInflight <= 0) {
              captureInflight = 0;
              clearTimeout(safetyTimer);
              showAfterCapture();
            }
          },
        );
      });
    }

    function checkSlide() {
      const current = getSlideNumber();
      if (current === lastSlide) return;
      lastSlide = current;
      requestCapture(current);
    }

    function heartbeatCapture() {
      const current = getSlideNumber();
      lastSlide = current;
      requestCapture(current);
    }

    let checkSlideTimer = null;
    function debouncedCheckSlide() {
      if (checkSlideTimer) clearTimeout(checkSlideTimer);
      checkSlideTimer = setTimeout(checkSlide, 400);
    }

    // Inject the side drawer
    function injectDrawer() {
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

            <button primary id="slidesync-start">${msg("startSession")}</button>
            <button class="danger" id="slidesync-stop" style="display:none;">${msg("stopSession")}</button>

            <div class="slidesync-settings">
              <div class="slidesync-setting-row">
                <div class="slidesync-setting-label">${msg("qrCodeLabel")}</div>
                <div class="slidesync-segmented" id="slidesync-qr-color-group">
                  <button type="button" class="slidesync-seg" data-value="off">${msg("qrColorOff")}</button>
                  <button type="button" class="slidesync-seg" data-value="black">${msg("qrColorBlack")}</button>
                  <button type="button" class="slidesync-seg" data-value="white">${msg("qrColorWhite")}</button>
                </div>
              </div>
              <div class="slidesync-setting-row">
                <div class="slidesync-setting-label">${msg("qrPositionLabel")}</div>
                <div class="slidesync-segmented positions" id="slidesync-qr-position-group">
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
              </div>
            </div>

            <div class="slidesync-footer">
              <div class="slidesync-sponsor">
                ${msg("sponsorMessage")}
                <a href="https://github.com/sponsors/thiavila" target="_blank">&#9829; ${msg("sponsorCta")}</a>
              </div>
              <div class="slidesync-credits">
                ${msg("inspiredBy")} <a href="https://limhenry.xyz/slides/" target="_blank">Remote for Slides</a>
                by <a href="https://limhenry.xyz/" target="_blank">Henry Lim</a>
              </div>
              <div class="slidesync-version">slidesync v2.3</div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(container);

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

      // Toggle button
      container.querySelector(".slidesync-toggle-btn").addEventListener("click", () => {
        const drawer = container.querySelector(".slidesync-drawer");
        drawer.toggleAttribute("toggle");

        if (drawer.getAttribute("toggle") === null) {
          // Closing
          clearTimeout(hideTimeout);
          container.setAttribute("active", "");
          hideTimeout = setTimeout(() => {
            container.removeAttribute("active");
          }, 1500);
        }
      });

      // Start/stop
      document.getElementById("slidesync-start").addEventListener("click", startSession);
      document.getElementById("slidesync-stop").addEventListener("click", stopSession);

      // QR settings (color + position) — write to storage; the onChanged
      // listener below picks up the value and re-renders selection state.
      document.querySelectorAll("#slidesync-qr-color-group .slidesync-seg").forEach((b) => {
        b.addEventListener("click", () => {
          chrome.storage.local.set({ qrColor: b.dataset.value });
        });
      });
      document.querySelectorAll("#slidesync-qr-position-group .slidesync-seg").forEach((b) => {
        b.addEventListener("click", () => {
          chrome.storage.local.set({ qrPosition: b.dataset.value });
        });
      });

      // Show drawer briefly on load
      container.setAttribute("active", "");
      hideTimeout = setTimeout(() => {
        container.removeAttribute("active");
      }, 4000);
    }

    function injectQROverlay() {
      const overlay = document.createElement("div");
      overlay.className = "slidesync-qr-overlay";
      overlay.id = "slidesync-qr-overlay";
      overlay.setAttribute("data-color", "off");
      overlay.setAttribute("data-position", "bottom-right");
      overlay.innerHTML = `<div class="slidesync-qr-canvas" id="slidesync-qr-canvas"></div>`;
      document.body.appendChild(overlay);
    }

    function generateRoomCode() {
      return Math.floor(100000 + Math.random() * 900000).toString();
    }

    function showDrawerQRCode(roomCode) {
      const sessionUrl = `${WEBAPP_URL}/session/${roomCode}`;
      const qrSection = document.getElementById("slidesync-qr-section");
      const qrContainer = document.getElementById("slidesync-qr");
      const urlEl = document.getElementById("slidesync-url");

      qrContainer.innerHTML = "";
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

    function syncDrawerSettings() {
      document.querySelectorAll("#slidesync-qr-color-group .slidesync-seg").forEach((b) => {
        b.classList.toggle("active", b.dataset.value === qrColor);
      });
      document.querySelectorAll("#slidesync-qr-position-group .slidesync-seg").forEach((b) => {
        b.classList.toggle("active", b.dataset.value === qrPosition);
      });
    }

    function renderOverlayQR() {
      const overlay = document.getElementById("slidesync-qr-overlay");
      if (!overlay) return;

      overlay.setAttribute("data-position", qrPosition);

      const canvas = document.getElementById("slidesync-qr-canvas");
      if (!canvas) return;

      // No session or off → empty overlay. Force data-color="off" so CSS
      // hides it even if the user picked a color before starting a session.
      if (!activeRoomCode || qrColor === "off") {
        overlay.setAttribute("data-color", "off");
        canvas.innerHTML = "";
        return;
      }
      overlay.setAttribute("data-color", qrColor);

      const sessionUrl = `${WEBAPP_URL}/session/${activeRoomCode}`;
      const colorDark = qrColor === "white" ? "#ffffff" : "#000000";
      const colorLight = qrColor === "white" ? "#000000" : "#ffffff";

      canvas.innerHTML = "";
      new QRCode(canvas, {
        text: sessionUrl,
        width: 128,
        height: 128,
        colorDark,
        colorLight,
        correctLevel: QRCode.CorrectLevel.M,
      });
    }

    function startSession() {
      const roomCode = generateRoomCode();
      const wsUrl = `wss://${PARTY_SERVER}/parties/main/${roomCode}`;

      chrome.storage.local.set({
        roomCode: roomCode,
        wsUrl: wsUrl,
        isActive: true,
      });

      chrome.runtime.sendMessage({
        type: "start-session",
        wsUrl: wsUrl,
        roomCode: roomCode,
      });

      document.getElementById("slidesync-code").textContent = roomCode;
      document.getElementById("slidesync-dot").classList.remove("inactive");
      document.getElementById("slidesync-status").textContent = msg("statusActive");
      document.getElementById("slidesync-start").style.display = "none";
      document.getElementById("slidesync-stop").style.display = "block";

      activeRoomCode = roomCode;
      showDrawerQRCode(roomCode);
      renderOverlayQR();
    }

    function stopSession() {
      chrome.runtime.sendMessage({ type: "stop-session" });
      chrome.storage.local.remove(["roomCode", "wsUrl", "isActive"]);

      document.getElementById("slidesync-code").textContent = "------";
      document.getElementById("slidesync-dot").classList.add("inactive");
      document.getElementById("slidesync-status").textContent = msg("statusDisconnected");
      document.getElementById("slidesync-start").style.display = "block";
      document.getElementById("slidesync-stop").style.display = "none";
      document.getElementById("slidesync-qr-section").style.display = "none";
      document.getElementById("slidesync-qr").innerHTML = "";

      activeRoomCode = null;
      renderOverlayQR();
    }

    // Navigation listeners (debounced to avoid flooding on rapid navigation)
    window.addEventListener("hashchange", debouncedCheckSlide);
    document.addEventListener("keydown", (e) => {
      if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown",
           " ", "PageUp", "PageDown", "Enter", "Backspace"].includes(e.key)) {
        debouncedCheckSlide();
      }
    });
    document.addEventListener("click", debouncedCheckSlide);
    setTimeout(checkSlide, 1000);
    setInterval(heartbeatCapture, 2000);

    // Inject UI
    injectDrawer();
    injectQROverlay();

    // Restore active session + QR settings from storage
    chrome.storage.local.get(
      ["roomCode", "isActive", "qrColor", "qrPosition"],
      (result) => {
        qrColor = result.qrColor || "off";
        qrPosition = result.qrPosition || "bottom-right";

        if (result.isActive && result.roomCode) {
          activeRoomCode = result.roomCode;
          document.getElementById("slidesync-code").textContent = result.roomCode;
          document.getElementById("slidesync-dot").classList.remove("inactive");
          document.getElementById("slidesync-status").textContent = msg("statusActive");
          document.getElementById("slidesync-start").style.display = "none";
          document.getElementById("slidesync-stop").style.display = "block";
          showDrawerQRCode(result.roomCode);
        }
        syncDrawerSettings();
        renderOverlayQR();
      },
    );

    // React to popup-driven changes to QR settings
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      let needsRender = false;
      let settingsChanged = false;
      if (changes.qrColor) { qrColor = changes.qrColor.newValue || "off"; needsRender = true; settingsChanged = true; }
      if (changes.qrPosition) { qrPosition = changes.qrPosition.newValue || "bottom-right"; needsRender = true; settingsChanged = true; }
      if (changes.roomCode) { activeRoomCode = changes.roomCode.newValue || null; needsRender = true; }
      if (changes.isActive && !changes.isActive.newValue) { activeRoomCode = null; needsRender = true; }
      if (settingsChanged) syncDrawerSettings();
      if (needsRender) renderOverlayQR();
    });

    // Auto-fullscreen: re-enter on every interaction (handles Esc exit)
    let userHasInteracted = false;
    function markInteracted() { userHasInteracted = true; }
    document.addEventListener("click", markInteracted, { once: true });
    document.addEventListener("keydown", markInteracted, { once: true });

    function ensureFullscreen() {
      if (userHasInteracted && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
    document.addEventListener("click", ensureFullscreen);
    document.addEventListener("keydown", ensureFullscreen);

    console.log("[slidesync] Present mode active with drawer + QR overlay");
  }

  // ===== EDIT MODE =====
  function initEditMode() {
    // Wait for the presentation container (like Remote for Slides does)
    const waitForUI = setInterval(() => {
      const presentContainer = document.querySelector('.punch-start-presentation-container');
      if (presentContainer) {
        clearInterval(waitForUI);
        injectButton(presentContainer);
      }
    }, 500);

    function injectButton(presentContainer) {
      const btn = document.createElement("a");
      btn.id = "slidesync-present-btn";
      btn.textContent = msg("presentButton");
      btn.setAttribute("aria-label", msg("presentButtonAria"));
      btn.setAttribute("data-tooltip", msg("presentButtonAria"));
      btn.href = window.location.href.replace("edit", "present");
      btn.target = "_blank";
      btn.addEventListener("click", () => {
        // Clear any previous session so present mode opens fresh
        chrome.storage.local.remove(["roomCode", "wsUrl", "isActive"]);
        chrome.runtime.sendMessage({ type: "stop-session" });
      });
      presentContainer.before(btn);

      console.log("[slidesync] Edit mode - button injected next to Present");
    }
  }
})();
