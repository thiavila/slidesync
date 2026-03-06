const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const disconnectedView = document.getElementById("disconnected-view");
const connectedView = document.getElementById("connected-view");
const apiUrlInput = document.getElementById("apiUrl");
const roomCodeInput = document.getElementById("roomCode");
const errorEl = document.getElementById("error");
const sessionTitle = document.getElementById("sessionTitle");
const connectedCode = document.getElementById("connectedCode");
const currentSlideEl = document.getElementById("currentSlide");

function showConnected(data) {
  disconnectedView.classList.add("hidden");
  connectedView.classList.remove("hidden");
  sessionTitle.textContent = data.title || "Apresentacao";
  connectedCode.textContent = data.roomCode;
  if (data.currentSlide) {
    currentSlideEl.textContent = data.currentSlide;
  }
}

function showDisconnected() {
  disconnectedView.classList.remove("hidden");
  connectedView.classList.add("hidden");
  errorEl.textContent = "";
}

// Load saved state on popup open
chrome.storage.local.get(
  ["apiUrl", "sessionId", "extensionSecret", "roomCode", "sessionTitle", "currentSlide"],
  (result) => {
    if (result.apiUrl) {
      apiUrlInput.value = result.apiUrl;
    }
    if (result.sessionId && result.extensionSecret) {
      showConnected({
        title: result.sessionTitle,
        roomCode: result.roomCode,
        currentSlide: result.currentSlide,
      });
    }
  }
);

// Update slide display in real-time
chrome.storage.onChanged.addListener((changes) => {
  if (changes.currentSlide) {
    currentSlideEl.textContent = changes.currentSlide.newValue;
  }
});

connectBtn.addEventListener("click", async () => {
  const apiUrl = apiUrlInput.value.trim().replace(/\/+$/, "");
  const roomCode = roomCodeInput.value.trim();

  if (!apiUrl) {
    errorEl.textContent = "Preencha o servidor";
    return;
  }
  if (!roomCode || roomCode.length !== 6) {
    errorEl.textContent = "Codigo deve ter 6 digitos";
    return;
  }

  errorEl.textContent = "";
  connectBtn.textContent = "Conectando...";
  connectBtn.disabled = true;

  try {
    const res = await fetch(`${apiUrl}/api/extension/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Sala nao encontrada");
    }

    const data = await res.json();

    chrome.storage.local.set({
      apiUrl,
      roomCode,
      sessionId: data.sessionId,
      extensionSecret: data.extensionSecret,
      sessionTitle: data.title,
    }, () => {
      showConnected({
        title: data.title,
        roomCode,
      });
    });
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    connectBtn.textContent = "Conectar";
    connectBtn.disabled = false;
  }
});

disconnectBtn.addEventListener("click", () => {
  chrome.storage.local.remove(
    ["sessionId", "extensionSecret", "roomCode", "sessionTitle", "currentSlide"],
    () => {
      roomCodeInput.value = "";
      showDisconnected();
    }
  );
});
