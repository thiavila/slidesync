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

            <div id="slidesync-qr-section" style="display:none;">
              <div class="slidesync-hr"></div>
              <div class="slidesync-qr-container" id="slidesync-qr"></div>
              <div class="slidesync-url" id="slidesync-url"></div>
            </div>

            <div class="slidesync-settings" id="slidesync-settings">
              <div class="slidesync-setting-label">${msg("qrCodeLabel")}</div>
              <div class="slidesync-segmented" data-count="2" data-active-index="0" id="slidesync-qr-enabled-group">
                <button type="button" class="slidesync-seg" data-value="off">${msg("qrColorOff")}</button>
                <button type="button" class="slidesync-seg" data-value="on">${msg("qrCodeOn")}</button>
              </div>
              <div class="slidesync-segmented positions" data-count="4" data-active-index="3" id="slidesync-qr-position-group">
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
              <div class="slidesync-qr-warning" id="slidesync-qr-warning">${msg("qrWarning")}</div>
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
              <div class="slidesync-version">slidesync v2.7</div>
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

      document.querySelectorAll("#slidesync-qr-enabled-group .slidesync-seg").forEach((b, i) => {
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
      const posGroup = document.getElementById("slidesync-qr-position-group");
      if (posGroup) {
        let idx = 0;
        posGroup.querySelectorAll(".slidesync-seg").forEach((b, i) => {
          const isActive = b.dataset.value === qrPosition;
          b.classList.toggle("active", isActive);
          if (isActive) idx = i;
        });
        posGroup.setAttribute("data-active-index", String(idx));
      }
      // Show the small "may leave a faint mark" warning only while the
      // overlay is on. It's an inline note, not a toast — persistent
      // while On so the user always knows what to expect.
      const warning = document.getElementById("slidesync-qr-warning");
      if (warning) warning.style.display = qrEnabled ? "block" : "none";
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

      activeRoomCode = null;
      hideDrawerQRCode();
      renderOverlayQR();
    }

    // Drawer-internal QR (visible to the presenter when the drawer is
    // open). This is a regular black-on-white QR — only the overlay
    // version uses the difference-blend trick, because the drawer is
    // typically off-screen during captures (translateX'd off-tab) and
    // its short open windows don't matter for the captured stream.
    function showDrawerQRCode(roomCode) {
      const sessionUrl = `${WEBAPP_URL}/session/${roomCode}`;
      const qrSection = document.getElementById("slidesync-qr-section");
      const qrContainer = document.getElementById("slidesync-qr");
      const urlEl = document.getElementById("slidesync-url");
      if (!qrSection || !qrContainer || !urlEl) return;

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

    function hideDrawerQRCode() {
      const qrSection = document.getElementById("slidesync-qr-section");
      const qrContainer = document.getElementById("slidesync-qr");
      if (qrSection) qrSection.style.display = "none";
      if (qrContainer) qrContainer.innerHTML = "";
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
          showDrawerQRCode(result.roomCode);
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
