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
    let activeRoomCode = null;
    let pipWindow = null;

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

    function requestCapture(slideNumber) {
      // No more hide-during-capture: the QR lives in a Document PiP window,
      // which is OS-level and not part of the captured tab.
      chrome.runtime.sendMessage(
        { type: "capture-slide", slideNumber },
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

    // ----- Document Picture-in-Picture for the QR -----
    // chrome.tabs.captureVisibleTab captures the tab's viewport. A PiP window
    // is a separate OS-level window, so it never appears in the screenshot.
    // Trade-off: requires a user gesture to open (clicking the color toggle
    // is one), and replaces the in-slide overlay with a draggable mini window.

    const pipSupported = "documentPictureInPicture" in window;

    function generateQRDataUrl(text, color) {
      const tmp = document.createElement("div");
      new QRCode(tmp, {
        text,
        width: 220,
        height: 220,
        colorDark: color === "white" ? "#ffffff" : "#000000",
        colorLight: "rgba(0,0,0,0)",
        correctLevel: QRCode.CorrectLevel.M,
      });
      const canvas = tmp.querySelector("canvas");
      if (canvas) return canvas.toDataURL("image/png");
      const img = tmp.querySelector("img");
      return img ? img.src : null;
    }

    async function openOrUpdatePiP() {
      if (!pipSupported) {
        console.warn("[slidesync] Document PiP not supported in this browser");
        return;
      }
      if (!activeRoomCode || qrColor === "off") return;

      if (!pipWindow) {
        try {
          pipWindow = await window.documentPictureInPicture.requestWindow({
            width: 260,
            height: 320,
          });
        } catch (e) {
          console.warn("[slidesync] PiP open failed:", e);
          return;
        }

        pipWindow.document.title = "slidesync";
        const style = pipWindow.document.createElement("style");
        style.textContent = `
          html, body { margin: 0; padding: 0; height: 100%; }
          body {
            font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 16px;
            box-sizing: border-box;
            background: #ffffff;
            color: #333333;
          }
          body[data-color="white"] { background: #000000; color: #cccccc; }
          .slidesync-pip-qr {
            width: min(220px, calc(100vw - 32px));
            aspect-ratio: 1 / 1;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .slidesync-pip-qr img {
            width: 100%;
            height: 100%;
            display: block;
            background: transparent;
            image-rendering: pixelated;
          }
          .slidesync-pip-url {
            font-size: 11px;
            letter-spacing: 0.3px;
            word-break: break-all;
            text-align: center;
            line-height: 1.3;
            opacity: 0.75;
          }
        `;
        pipWindow.document.head.appendChild(style);
        pipWindow.document.body.innerHTML = `
          <div class="slidesync-pip-qr"><img id="pip-qr" alt="QR" /></div>
          <div class="slidesync-pip-url" id="pip-url"></div>
        `;

        // User closed the PiP via the OS X button → keep state in sync
        pipWindow.addEventListener("pagehide", () => {
          pipWindow = null;
          if (qrColor !== "off") {
            chrome.storage.local.set({ qrColor: "off" });
          }
        });
      }

      // Update content (also fires when color changes between black/white)
      const sessionUrl = `${WEBAPP_URL}/session/${activeRoomCode}`;
      pipWindow.document.body.setAttribute("data-color", qrColor);
      const dataUrl = generateQRDataUrl(sessionUrl, qrColor);
      const imgEl = pipWindow.document.getElementById("pip-qr");
      const urlEl = pipWindow.document.getElementById("pip-url");
      if (imgEl && dataUrl) imgEl.src = dataUrl;
      if (urlEl) urlEl.textContent = sessionUrl;
    }

    function closePiP() {
      if (!pipWindow) return;
      try { pipWindow.close(); } catch (_) { /* ignore */ }
      pipWindow = null;
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
                    <div class="slidesync-segmented" id="slidesync-qr-color-group">
                      <button type="button" class="slidesync-seg" data-value="off">${msg("qrColorOff")}</button>
                      <button type="button" class="slidesync-seg" data-value="black">${msg("qrColorBlack")}</button>
                      <button type="button" class="slidesync-seg" data-value="white">${msg("qrColorWhite")}</button>
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
              <div class="slidesync-version">slidesync v2.4</div>
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

      // Collapsible settings header
      const settings = document.getElementById("slidesync-settings");
      const settingsToggle = document.getElementById("slidesync-settings-toggle");
      settingsToggle.addEventListener("click", () => {
        const expanded = settings.getAttribute("data-expanded") === "true";
        settings.setAttribute("data-expanded", expanded ? "false" : "true");
        settingsToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
      });

      // QR color toggle. The click event itself is the user gesture that
      // documentPictureInPicture.requestWindow() requires.
      document.querySelectorAll("#slidesync-qr-color-group .slidesync-seg").forEach((b) => {
        b.addEventListener("click", () => {
          const value = b.dataset.value;
          chrome.storage.local.set({ qrColor: value });
          // Local-tab onChanged listeners are async, so update local var
          // synchronously to keep the click-bound user gesture for PiP.
          qrColor = value;
          syncDrawerSettings();
          if (value === "off") {
            closePiP();
          } else {
            openOrUpdatePiP();
          }
        });
      });

      container.setAttribute("active", "");
      hideTimeout = setTimeout(() => {
        container.removeAttribute("active");
      }, 4000);
    }

    function generateRoomCode() {
      return Math.floor(100000 + Math.random() * 900000).toString();
    }

    function syncDrawerSettings() {
      document.querySelectorAll("#slidesync-qr-color-group .slidesync-seg").forEach((b) => {
        b.classList.toggle("active", b.dataset.value === qrColor);
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
      // Click on the start button counts as user gesture, so if a previous
      // session left qrColor != off we can re-open PiP automatically.
      if (qrColor !== "off") {
        openOrUpdatePiP();
      }
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
      closePiP();
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
    // Heartbeat is now a cheap backstop. The PiP window is unaffected by it,
    // so flicker is gone — the heartbeat is just a no-cost no-op for the QR.
    setInterval(heartbeatCapture, 10000);

    // Inject UI
    injectDrawer();

    // Restore active session + QR settings from storage
    chrome.storage.local.get(
      ["roomCode", "isActive", "qrColor"],
      (result) => {
        qrColor = result.qrColor || "off";

        if (result.isActive && result.roomCode) {
          activeRoomCode = result.roomCode;
          document.getElementById("slidesync-code").textContent = result.roomCode;
          document.getElementById("slidesync-dot").classList.remove("inactive");
          document.getElementById("slidesync-status").textContent = msg("statusActive");
          document.getElementById("slidesync-start").style.display = "none";
          document.getElementById("slidesync-stop").style.display = "block";
        }
        syncDrawerSettings();
        // Cannot auto-open PiP here — no user gesture. User has to click the
        // color button again to re-open the QR window after page load.
      },
    );

    // Sync state when storage changes (e.g., from popup or pip-close handler)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.qrColor) {
        qrColor = changes.qrColor.newValue || "off";
        syncDrawerSettings();
        // Don't try to open PiP here — without a user gesture it'll fail.
        // The drawer click handler covers that path. We do close it though.
        if (qrColor === "off") closePiP();
      }
      if (changes.roomCode) activeRoomCode = changes.roomCode.newValue || null;
      if (changes.isActive && !changes.isActive.newValue) {
        activeRoomCode = null;
        closePiP();
      }
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

    console.log("[slidesync] Present mode active with drawer + PiP QR");
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
