(() => {
  let lastSlide = null;
  let config = null;

  async function loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ["sessionId", "apiUrl", "extensionSecret"],
        (result) => {
          if (result.sessionId && result.apiUrl && result.extensionSecret) {
            config = result;
            resolve(true);
          } else {
            resolve(false);
          }
        }
      );
    });
  }

  function getSlideNumberFromHash() {
    const hash = window.location.hash;
    // Google Slides uses hashes like:
    // #slide=id.p       (slide 1)
    // #slide=id.p2      (slide 2... but sometimes 0-indexed)
    // #slide=id.g1234   (custom object id)
    // #slide=id.i0      (slide index 0)

    // Try direct number after 'p'
    const pMatch = hash.match(/slide=id\.p(\d+)/);
    if (pMatch) {
      // Google sometimes uses 0-indexed, sometimes 1-indexed
      const num = parseInt(pMatch[1], 10);
      return num === 0 ? 1 : num;
    }

    // First slide: #slide=id.p
    if (/slide=id\.p$/.test(hash)) {
      return 1;
    }

    return null;
  }

  function getSlideNumberFromDOM() {
    // Method 1: Look for the current slide indicator in presenter view
    const navText = document.querySelector(
      '[class*="punch-viewer-page-indicator"],' +
      '[class*="punch-viewer-slide-number"],' +
      '[aria-label*="Slide "]'
    );
    if (navText) {
      const text = navText.textContent || navText.getAttribute("aria-label") || "";
      const match = text.match(/(\d+)\s*(?:\/|of|de)\s*(\d+)/);
      if (match) return parseInt(match[1], 10);
      const simpleMatch = text.match(/(\d+)/);
      if (simpleMatch) return parseInt(simpleMatch[1], 10);
    }

    // Method 2: Count SVG groups that represent slides in the filmstrip
    const filmstrip = document.querySelector('[class*="punch-filmstrip"]');
    if (filmstrip) {
      const items = filmstrip.querySelectorAll('[aria-selected="true"]');
      if (items.length > 0) {
        const allItems = filmstrip.querySelectorAll('[role="option"], [role="tab"], [aria-roledescription="slide"]');
        for (let i = 0; i < allItems.length; i++) {
          if (allItems[i].getAttribute("aria-selected") === "true") {
            return i + 1;
          }
        }
      }
    }

    // Method 3: Look for aria-roledescription="slide" and find visible one
    const allSlides = document.querySelectorAll('[aria-roledescription="slide"]');
    if (allSlides.length > 0) {
      for (let i = 0; i < allSlides.length; i++) {
        const style = window.getComputedStyle(allSlides[i]);
        if (style.display !== "none" && style.visibility !== "hidden" &&
            allSlides[i].getAttribute("aria-hidden") !== "true") {
          return i + 1;
        }
      }
    }

    // Method 4: Parse from URL query params
    const url = new URL(window.location.href);
    const slideParam = url.searchParams.get("slide");
    if (slideParam) {
      const match = slideParam.match(/(\d+)/);
      if (match) return parseInt(match[1], 10);
    }

    return null;
  }

  function getSlideFromSVGTransform() {
    // In full-screen presentation mode, Google Slides uses SVG transforms
    // to position slides. The visible slide has a specific transform.
    const svgSlides = document.querySelectorAll('.punch-viewer-content [data-slide-id]');
    if (svgSlides.length > 0) {
      for (let i = 0; i < svgSlides.length; i++) {
        const rect = svgSlides[i].getBoundingClientRect();
        // The visible slide is within the viewport
        if (rect.width > 0 && rect.height > 0 &&
            rect.left >= -10 && rect.top >= -10 &&
            rect.left < window.innerWidth && rect.top < window.innerHeight) {
          return i + 1;
        }
      }
    }
    return null;
  }

  function getCurrentSlide() {
    return getSlideNumberFromHash() ||
           getSlideNumberFromDOM() ||
           getSlideFromSVGTransform() ||
           lastSlide ||
           1;
  }

  async function sendSlideUpdate(slideNumber) {
    if (!config) return;

    console.log("[Slide Sync] Sending slide update:", slideNumber);
    chrome.runtime.sendMessage(
      {
        type: "updateSlide",
        apiUrl: config.apiUrl,
        sessionId: config.sessionId,
        currentSlide: slideNumber,
        extensionSecret: config.extensionSecret,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[Slide Sync] Message error:", chrome.runtime.lastError.message);
          return;
        }
        if (response && response.ok) {
          console.log("[Slide Sync] Slide updated to:", slideNumber);
        } else {
          console.warn("[Slide Sync] API error:", response?.error);
        }
      }
    );
  }

  function checkSlideChange() {
    const current = getCurrentSlide();
    if (current !== null && current !== lastSlide) {
      console.log("[Slide Sync] Slide changed:", lastSlide, "->", current);
      lastSlide = current;
      sendSlideUpdate(current);
      chrome.storage.local.set({ currentSlide: current });
    }
  }

  async function init() {
    const hasConfig = await loadConfig();
    if (!hasConfig) {
      console.log("[Slide Sync] Not configured. Open the extension popup to connect.");
      // Keep checking for config
      const configInterval = setInterval(async () => {
        const ready = await loadConfig();
        if (ready) {
          clearInterval(configInterval);
          startTracking();
        }
      }, 2000);
      return;
    }

    startTracking();
  }

  function startTracking() {
    console.log("[Slide Sync] Active for session:", config.sessionId);

    // Listen for hash changes
    window.addEventListener("hashchange", () => {
      setTimeout(checkSlideChange, 50);
    });

    // Listen for keyboard navigation
    document.addEventListener("keydown", (e) => {
      // Arrow keys, space, page up/down, enter
      if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown",
           " ", "PageUp", "PageDown", "Enter", "Backspace"].includes(e.key)) {
        setTimeout(checkSlideChange, 200);
      }
    });

    // Listen for click navigation
    document.addEventListener("click", () => {
      setTimeout(checkSlideChange, 200);
    });

    // Polling fallback every 1 second (more responsive)
    setInterval(checkSlideChange, 1000);

    // Initial check
    checkSlideChange();
  }

  // Listen for config changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.sessionId || changes.apiUrl || changes.extensionSecret) {
      loadConfig().then((hasConfig) => {
        if (hasConfig) {
          console.log("[Slide Sync] Config updated, re-syncing.");
          checkSlideChange();
        }
      });
    }
  });

  init();
})();
