// i18n
const msg = (key) => chrome.i18n.getMessage(key) || key;
document.getElementById("no-active-session").textContent = msg("noActiveSession");
document.getElementById("open-presentation-hint").textContent = msg("openPresentationHint");
document.getElementById("active-session").textContent = msg("activeSession");
document.getElementById("room-code-label").textContent = msg("roomCodeLabel");
document.getElementById("current-slide-label").textContent = msg("currentSlideLabel");

document.getElementById("qr-code-label").textContent = msg("qrCodeLabel");
document.getElementById("qr-position-label").textContent = msg("qrPositionLabel");

document.getElementById("qr-color-off").textContent = msg("qrColorOff");
document.getElementById("qr-color-black").textContent = msg("qrColorBlack");
document.getElementById("qr-color-white").textContent = msg("qrColorWhite");

const posLabels = {
  "qr-pos-tl": "qrPositionTopLeft",
  "qr-pos-tr": "qrPositionTopRight",
  "qr-pos-bl": "qrPositionBottomLeft",
  "qr-pos-br": "qrPositionBottomRight",
};
for (const [id, key] of Object.entries(posLabels)) {
  const btn = document.getElementById(id);
  btn.setAttribute("aria-label", msg(key));
  btn.setAttribute("title", msg(key));
}

const inactiveView = document.getElementById("inactive-view");
const activeView = document.getElementById("active-view");
const roomCodeEl = document.getElementById("roomCode");
const currentSlideEl = document.getElementById("currentSlide");

const QR_DEFAULTS = { qrColor: "off", qrPosition: "bottom-right" };

function applyColorSelection(value) {
  document.querySelectorAll("#qr-color-group .seg").forEach((b) => {
    const isActive = b.dataset.value === value;
    b.classList.toggle("active", isActive);
    b.setAttribute("aria-checked", isActive ? "true" : "false");
  });
}

function applyPositionSelection(value) {
  document.querySelectorAll("#qr-position-group .seg").forEach((b) => {
    const isActive = b.dataset.value === value;
    b.classList.toggle("active", isActive);
    b.setAttribute("aria-checked", isActive ? "true" : "false");
  });
}

// Load current state
chrome.storage.local.get(
  ["roomCode", "isActive", "currentSlide", "qrColor", "qrPosition"],
  (result) => {
    if (result.isActive && result.roomCode) {
      inactiveView.classList.add("hidden");
      activeView.classList.remove("hidden");
      roomCodeEl.textContent = result.roomCode;
      if (result.currentSlide) {
        currentSlideEl.textContent = result.currentSlide;
      }
    }
    applyColorSelection(result.qrColor || QR_DEFAULTS.qrColor);
    applyPositionSelection(result.qrPosition || QR_DEFAULTS.qrPosition);
  },
);

// Wire toggles
document.querySelectorAll("#qr-color-group .seg").forEach((b) => {
  b.addEventListener("click", () => {
    const value = b.dataset.value;
    applyColorSelection(value);
    chrome.storage.local.set({ qrColor: value });
  });
});

document.querySelectorAll("#qr-position-group .seg").forEach((b) => {
  b.addEventListener("click", () => {
    const value = b.dataset.value;
    applyPositionSelection(value);
    chrome.storage.local.set({ qrPosition: value });
  });
});

// Listen for changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.isActive) {
    if (changes.isActive.newValue) {
      inactiveView.classList.add("hidden");
      activeView.classList.remove("hidden");
    } else {
      inactiveView.classList.remove("hidden");
      activeView.classList.add("hidden");
    }
  }
  if (changes.roomCode && changes.roomCode.newValue) {
    roomCodeEl.textContent = changes.roomCode.newValue;
  }
  if (changes.currentSlide && changes.currentSlide.newValue) {
    currentSlideEl.textContent = changes.currentSlide.newValue;
  }
  if (changes.qrColor && changes.qrColor.newValue) {
    applyColorSelection(changes.qrColor.newValue);
  }
  if (changes.qrPosition && changes.qrPosition.newValue) {
    applyPositionSelection(changes.qrPosition.newValue);
  }
});
