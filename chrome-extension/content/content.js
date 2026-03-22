(() => {
  const PARTY_SERVER = "slide-sync.thiavila.partykit.dev";
  const WEBAPP_URL = "https://slidesync.live";
  const msg = (key) => chrome.i18n.getMessage(key) || key;

  const pathname = window.location.pathname;
  const isPresentPage = /\/present(\/|$)/.test(pathname);
  const isEditPage = !isPresentPage;

  console.log("[Slide Sync] Loading on:", window.location.href, "| Edit:", isEditPage, "| Present:", isPresentPage);

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

    function checkSlide() {
      const current = getSlideNumber();
      if (current === lastSlide) return;
      lastSlide = current;
      chrome.runtime.sendMessage({
        type: "capture-slide",
        slideNumber: current,
      });
    }

    function heartbeatCapture() {
      const current = getSlideNumber();
      lastSlide = current;
      chrome.runtime.sendMessage({
        type: "capture-slide",
        slideNumber: current,
      });
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
              <path d="M14.71 6.71c-.39-.39-1.02-.39-1.41 0L8.71 11.3c-.39.39-.39 1.02 0 1.41l4.59 4.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L10.83 12l3.88-3.88c.39-.39.38-1.03 0-1.41z" fill="#fff"/>
            </svg>
          </div>
          <div class="slidesync-drawer-content">
            <div class="slidesync-title">Slide Sync</div>
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

            <div class="slidesync-footer">
              Slide Sync v2.1
              <div class="slidesync-credits">
                ${msg("inspiredBy")} <a href="https://limhenry.xyz/slides/" target="_blank">Remote for Slides</a>
                by <a href="https://limhenry.xyz/" target="_blank">Henry Lim</a>
              </div>
              <div class="slidesync-sponsor">
                <a href="https://github.com/sponsors/thiavila" target="_blank">&#9829; ${msg("sponsor")}</a>
              </div>
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

      // Show drawer briefly on load
      container.setAttribute("active", "");
      hideTimeout = setTimeout(() => {
        container.removeAttribute("active");
      }, 4000);

      // Restore active session
      chrome.storage.local.get(["roomCode", "isActive"], (result) => {
        if (result.isActive && result.roomCode) {
          document.getElementById("slidesync-code").textContent = result.roomCode;
          document.getElementById("slidesync-dot").classList.remove("inactive");
          document.getElementById("slidesync-status").textContent = msg("statusActive");
          document.getElementById("slidesync-start").style.display = "none";
          document.getElementById("slidesync-stop").style.display = "block";
          showQRCode(result.roomCode);
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

      qrContainer.innerHTML = "";
      new QRCode(qrContainer, {
        text: sessionUrl,
        width: 200,
        height: 200,
        colorDark: "#ffffff",
        colorLight: "#323232",
        correctLevel: QRCode.CorrectLevel.M,
      });
      urlEl.textContent = sessionUrl;
      qrSection.style.display = "block";
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

      showQRCode(roomCode);
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

    // Inject drawer UI
    injectDrawer();

    // Auto-fullscreen: enter on interaction, re-enter if exited
    function ensureFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
    document.addEventListener("click", ensureFullscreen);
    document.addEventListener("keydown", ensureFullscreen);

    console.log("[Slide Sync] Present mode active with drawer");
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

      console.log("[Slide Sync] Edit mode - button injected next to Present");
    }
  }
})();
