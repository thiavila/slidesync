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
    let qrEnabled = false;
    let qrPosition = "bottom-right";
    let activeRoomCode = null;

    function getSlideNumber() {
      const counter = document.querySelector(".goog-flat-menu-button-caption") ||
                      document.querySelector(".docs-material-menu-button-flat-default-caption");
      if (counter) {
        const pos = counter.getAttribute("aria-posinset");
        if (pos) return parseInt(pos, 10);
      }
      const hash = window.location.hash;
      const pMatch = hash.match(/slide=id\.p(\d+)/);
      if (pMatch) {
        const num = parseInt(pMatch[1], 10);
        return num === 0 ? 1 : num;
      }
      if (/slide=id\.p$/.test(hash)) return 1;
      return lastSlide || 1;
    }

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

    function requestCapture(slideNumber) {
      chrome.runtime.sendMessage(
        {
          type: "capture-slide",
          slideNumber,
          qrRect: getQRRect(),
        },
        () => { void chrome.runtime.lastError; },
      );
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

            <div class="slidesync-status">
              <span class="dot inactive" id="slidesync-dot"></span>
              <span id="slidesync-status">${msg("statusDisconnected")}</span>
            </div>

            <button primary id="slidesync-start">${msg("startSession")}</button>
            <button class="danger" id="slidesync-stop" style="display:none;">${msg("stopSession")}</button>

            <div class="slidesync-settings" data-expanded="false" id="slidesync-settings">
              <button type="button" class="slidesync-settings-header" id="slidesync-settings-toggle" aria-expanded="false">
                <span>${msg("qrCodeLabel")}</span>
                <svg class="slidesync-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <div class="slidesync-settings-body">
                <div class="slidesync-settings-body-inner">
                  <div class="slidesync-setting-row">
                    <div class="slidesync-segmented" id="slidesync-qr-enabled-group">
                      <button type="button" class="slidesync-seg" data-value="off">${msg("qrColorOff")}</button>
                      <button type="button" class="slidesync-seg" data-value="on">${msg("qrCodeOn")}</button>
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
              <div class="slidesync-version">slidesync v2.6</div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(container);

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

      const settings = document.getElementById("slidesync-settings");
      const settingsToggle = document.getElementById("slidesync-settings-toggle");
      settingsToggle.addEventListener("click", () => {
        const expanded = settings.getAttribute("data-expanded") === "true";
        settings.setAttribute("data-expanded", expanded ? "false" : "true");
        settingsToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
      });

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

    function syncDrawerSettings() {
      const enabledValue = qrEnabled ? "on" : "off";
      document.querySelectorAll("#slidesync-qr-enabled-group .slidesync-seg").forEach((b) => {
        b.classList.toggle("active", b.dataset.value === enabledValue);
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

      if (!activeRoomCode || !qrEnabled) {
        overlay.setAttribute("data-active", "false");
        canvas.innerHTML = "";
        return;
      }
      overlay.setAttribute("data-active", "true");

      const sessionUrl = `${WEBAPP_URL}/session/${activeRoomCode}`;

      canvas.innerHTML = "";
      // White modules + mix-blend-mode: difference (in CSS) means the on-screen
      // pixel becomes the inverse of the slide pixel underneath each dark
      // module. The "Off" / "On" toggle is enough — there's no color choice
      // because contrast is automatic.
      // High error correction → denser matrix (33×33 for ~36-char URL),
      // visually finer / less heavy than M-level (29×29).
      // Buffer of 111 = 37 (module count for our URL at H correction) × 3.
      // Integer module pitch is REQUIRED for the difference-blend
      // cancellation to be exact (any fractional pitch introduces
      // sub-pixel anti-aliasing that doesn't cancel cleanly).
      const qrcode = new QRCode(canvas, {
        text: sessionUrl,
        width: 111,
        height: 111,
        colorDark: "#ffffff",
        colorLight: "rgba(0,0,0,0)",
        correctLevel: QRCode.CorrectLevel.H,
      });
      const ovRect = overlay.getBoundingClientRect();
      const innerCanvas = canvas.querySelector("canvas");
      console.log(
        "[slidesync] QR rendered",
        `overlay=${ovRect.width.toFixed(1)}x${ovRect.height.toFixed(1)} CSS px`,
        `canvas-buffer=${innerCanvas ? innerCanvas.width + "x" + innerCanvas.height : "n/a"}`,
        `dpr=${window.devicePixelRatio}`,
      );
      // Suppress unused-warning lint: qrcode is used via the canvas it inserts.
      void qrcode;
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

      activeRoomCode = null;
      renderOverlayQR();
    }

    window.addEventListener("hashchange", debouncedCheckSlide);
    document.addEventListener("keydown", (e) => {
      if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown",
           " ", "PageUp", "PageDown", "Enter", "Backspace"].includes(e.key)) {
        debouncedCheckSlide();
      }
    });
    document.addEventListener("click", debouncedCheckSlide);
    setTimeout(checkSlide, 1000);
    // Heartbeat at 10s. Each capture-slide message includes the QR rect
    // so the background script can paint it out of the snapshot.
    setInterval(heartbeatCapture, 10000);

    injectDrawer();
    injectQROverlay();

    chrome.storage.local.get(
      ["roomCode", "isActive", "qrEnabled", "qrPosition"],
      (result) => {
        qrEnabled = !!result.qrEnabled;
        qrPosition = result.qrPosition || "bottom-right";

        if (result.isActive && result.roomCode) {
          activeRoomCode = result.roomCode;
          document.getElementById("slidesync-code").textContent = result.roomCode;
          document.getElementById("slidesync-dot").classList.remove("inactive");
          document.getElementById("slidesync-status").textContent = msg("statusActive");
          document.getElementById("slidesync-start").style.display = "none";
          document.getElementById("slidesync-stop").style.display = "block";
        }
        syncDrawerSettings();
        renderOverlayQR();
      },
    );

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      let needsRender = false;
      let settingsChanged = false;
      if (changes.qrEnabled) { qrEnabled = !!changes.qrEnabled.newValue; needsRender = true; settingsChanged = true; }
      if (changes.qrPosition) { qrPosition = changes.qrPosition.newValue || "bottom-right"; needsRender = true; settingsChanged = true; }
      if (changes.roomCode) { activeRoomCode = changes.roomCode.newValue || null; needsRender = true; }
      if (changes.isActive && !changes.isActive.newValue) { activeRoomCode = null; needsRender = true; }
      if (settingsChanged) syncDrawerSettings();
      if (needsRender) renderOverlayQR();
    });

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

    console.log("[slidesync] Present mode active with edge-stretch QR patching");
  }

  // ===== EDIT MODE =====
  function initEditMode() {
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
        chrome.storage.local.remove(["roomCode", "wsUrl", "isActive"]);
        chrome.runtime.sendMessage({ type: "stop-session" });
      });
      presentContainer.before(btn);
      console.log("[slidesync] Edit mode - button injected next to Present");
    }
  }
})();
