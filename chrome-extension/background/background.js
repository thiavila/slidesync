// Background service worker - handles API calls to avoid CORS issues

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "updateSlide") {
    const { apiUrl, sessionId, currentSlide, extensionSecret } = message;

    fetch(`${apiUrl}/api/extension/update-slide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, currentSlide, extensionSecret }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then((text) => {
            sendResponse({ ok: false, error: `API error ${res.status}: ${text}` });
          });
        }
        sendResponse({ ok: true });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });

    // Return true to indicate async response
    return true;
  }
});
