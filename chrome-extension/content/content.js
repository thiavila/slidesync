(() => {
  // Only run on edit pages (not present pages)
  const isEditPage = window.location.href.includes("/edit");
  const isPresentPage = window.location.href.includes("/present");

  if (isPresentPage) {
    // On present page: detect slide changes and notify background
    initPresentMode();
    return;
  }

  if (isEditPage) {
    // On edit page: inject the Slide Sync UI
    initEditMode();
    return;
  }

  // ===== PRESENT MODE =====
  function initPresentMode() {
    let lastSlide = null;

    function getSlideNumber() {
      const hash = window.location.hash;
      const pMatch = hash.match(/slide=id\.p(\d+)/);
      if (pMatch) {
        const num = parseInt(pMatch[1], 10);
        return num === 0 ? 1 : num;
      }
      if (/slide=id\.p$/.test(hash)) return 1;

      // DOM fallback
      const allSlides = document.querySelectorAll('[aria-roledescription="slide"]');
      if (allSlides.length > 0) {
        for (let i = 0; i < allSlides.length; i++) {
          if (allSlides[i].getAttribute("aria-hidden") !== "true") {
            return i + 1;
          }
        }
      }
      return lastSlide || 1;
    }

    function checkSlide() {
      const current = getSlideNumber();
      if (current !== lastSlide) {
        lastSlide = current;
        // Ask background to capture screenshot
        chrome.runtime.sendMessage({
          type: "capture-slide",
          slideNumber: current,
        });
      } else {
        // Same slide but might be animation update
        chrome.runtime.sendMessage({
          type: "capture-slide",
          slideNumber: current,
        });
      }
    }

    // Listen for navigation
    window.addEventListener("hashchange", () => setTimeout(checkSlide, 100));
    document.addEventListener("keydown", (e) => {
      if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown",
           " ", "PageUp", "PageDown", "Enter", "Backspace"].includes(e.key)) {
        setTimeout(checkSlide, 300);
      }
    });
    document.addEventListener("click", () => setTimeout(checkSlide, 300));

    // Initial capture after a short delay for rendering
    setTimeout(checkSlide, 1000);

    // Polling every 2s as fallback
    setInterval(checkSlide, 2000);

    console.log("[Slide Sync] Present mode active");
  }

  // ===== EDIT MODE =====
  function initEditMode() {
    // Wait for Google Slides UI to load
    const waitForUI = setInterval(() => {
      const menuBar = document.querySelector('#docs-menubars');
      if (menuBar) {
        clearInterval(waitForUI);
        injectUI();
      }
    }, 500);

    function injectUI() {
      // Create banner
      const banner = document.createElement("div");
      banner.id = "slidesync-banner";
      banner.innerHTML = `
        <span>📡 Slide Sync disponivel</span>
        <button id="slidesync-open-panel">Apresentar com Slide Sync</button>
        <button class="close-btn" id="slidesync-close-banner">✕</button>
      `;
      document.body.appendChild(banner);

      // Create panel
      const panel = document.createElement("div");
      panel.id = "slidesync-panel";
      panel.className = "hidden";
      panel.innerHTML = `
        <h2>Slide Sync</h2>
        <p class="subtitle">Compartilhe seus slides em tempo real</p>
        <label style="font-size:12px;color:#5f6368;display:block;margin-bottom:4px;">Servidor PartyKit</label>
        <input type="text" class="server-input" id="slidesync-server"
               placeholder="localhost:1999" value="localhost:1999" />
        <div class="room-code">
          <div class="label">Codigo da sala</div>
          <div class="code" id="slidesync-code">------</div>
        </div>
        <div class="status">
          <span class="dot inactive" id="slidesync-dot"></span>
          <span id="slidesync-status">Desconectado</span>
        </div>
        <button class="btn-present" id="slidesync-start">Iniciar apresentacao</button>
        <button class="btn-stop hidden" id="slidesync-stop" style="display:none;">Encerrar sessao</button>
      `;
      document.body.appendChild(panel);

      // Load saved server
      chrome.storage.local.get(["partyServer"], (result) => {
        if (result.partyServer) {
          document.getElementById("slidesync-server").value = result.partyServer;
        }
      });

      // Event listeners
      document.getElementById("slidesync-open-panel").addEventListener("click", () => {
        panel.classList.toggle("hidden");
      });

      document.getElementById("slidesync-close-banner").addEventListener("click", () => {
        banner.classList.add("hidden");
      });

      document.getElementById("slidesync-start").addEventListener("click", startSession);
      document.getElementById("slidesync-stop").addEventListener("click", stopSession);
    }

    function generateRoomCode() {
      return Math.floor(100000 + Math.random() * 900000).toString();
    }

    function startSession() {
      const server = document.getElementById("slidesync-server").value.trim();
      if (!server) return;

      const roomCode = generateRoomCode();
      const protocol = server.startsWith("localhost") ? "ws" : "wss";
      const wsUrl = `${protocol}://${server}/party/${roomCode}`;

      // Save config
      chrome.storage.local.set({
        partyServer: server,
        roomCode: roomCode,
        wsUrl: wsUrl,
        isActive: true,
      });

      // Tell background to connect
      chrome.runtime.sendMessage({
        type: "start-session",
        wsUrl: wsUrl,
        roomCode: roomCode,
      });

      // Update UI
      document.getElementById("slidesync-code").textContent = roomCode;
      document.getElementById("slidesync-dot").classList.remove("inactive");
      document.getElementById("slidesync-status").textContent = "Ativo - aguardando apresentacao";
      document.getElementById("slidesync-start").style.display = "none";
      document.getElementById("slidesync-stop").style.display = "block";
      document.getElementById("slidesync-server").disabled = true;

      // Open presentation in new window
      const presentUrl = window.location.href.replace("/edit", "/present");
      window.open(presentUrl, "_blank", "width=1280,height=720");
    }

    function stopSession() {
      chrome.runtime.sendMessage({ type: "stop-session" });
      chrome.storage.local.remove(["roomCode", "wsUrl", "isActive"]);

      // Reset UI
      document.getElementById("slidesync-code").textContent = "------";
      document.getElementById("slidesync-dot").classList.add("inactive");
      document.getElementById("slidesync-status").textContent = "Desconectado";
      document.getElementById("slidesync-start").style.display = "block";
      document.getElementById("slidesync-stop").style.display = "none";
      document.getElementById("slidesync-server").disabled = false;
    }

    // Check if there's already an active session
    chrome.storage.local.get(["roomCode", "isActive"], (result) => {
      if (result.isActive && result.roomCode) {
        // Restore UI state
        setTimeout(() => {
          const codeEl = document.getElementById("slidesync-code");
          if (codeEl) {
            codeEl.textContent = result.roomCode;
            document.getElementById("slidesync-dot").classList.remove("inactive");
            document.getElementById("slidesync-status").textContent = "Ativo";
            document.getElementById("slidesync-start").style.display = "none";
            document.getElementById("slidesync-stop").style.display = "block";
            document.getElementById("slidesync-server").disabled = true;
            document.getElementById("slidesync-panel").classList.remove("hidden");
          }
        }, 1500);
      }
    });

    console.log("[Slide Sync] Edit mode - UI injected");
  }
})();
