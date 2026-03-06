const inactiveView = document.getElementById("inactive-view");
const activeView = document.getElementById("active-view");
const roomCodeEl = document.getElementById("roomCode");
const currentSlideEl = document.getElementById("currentSlide");

// Load current state
chrome.storage.local.get(["roomCode", "isActive", "currentSlide"], (result) => {
  if (result.isActive && result.roomCode) {
    inactiveView.classList.add("hidden");
    activeView.classList.remove("hidden");
    roomCodeEl.textContent = result.roomCode;
    if (result.currentSlide) {
      currentSlideEl.textContent = result.currentSlide;
    }
  }
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
});
