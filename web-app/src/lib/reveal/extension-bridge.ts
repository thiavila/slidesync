// Detect whether the slidesync Chrome extension is installed.
// The extension's content script (content/reveal-bridge.js) announces
// itself via window.postMessage on load and replies to "ping" requests.

const PAGE_SOURCE = "slidesync-page";
const EXT_SOURCE = "slidesync-extension";

type ExtMessage =
  | { source: typeof EXT_SOURCE; type: "ready"; version: string }
  | { source: typeof EXT_SOURCE; type: "pong"; id: string; version: string };

let extReady = false;
let extVersion: string | null = null;
let initialized = false;

const pending = new Map<
  string,
  { resolve: (msg: ExtMessage) => void; timer: ReturnType<typeof setTimeout> }
>();

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data as ExtMessage | undefined;
    if (!data || data.source !== EXT_SOURCE) return;

    if (data.type === "ready") {
      extReady = true;
      extVersion = data.version;
      return;
    }

    if (data.type === "pong") {
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      clearTimeout(entry.timer);
      entry.resolve(data);
    }
  });
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function detectExtension(timeoutMs = 1500): Promise<{
  available: boolean;
  version?: string;
}> {
  init();
  if (typeof window === "undefined") return { available: false };
  if (extReady) return { available: true, version: extVersion ?? undefined };

  return new Promise((resolve) => {
    const id = nextId();
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ available: false });
    }, timeoutMs);
    pending.set(id, {
      resolve: (msg) => {
        if (msg.type === "pong") {
          extReady = true;
          extVersion = msg.version;
          resolve({ available: true, version: msg.version });
        } else {
          resolve({ available: false });
        }
      },
      timer,
    });
    window.postMessage({ source: PAGE_SOURCE, type: "ping", id }, "*");
  });
}
