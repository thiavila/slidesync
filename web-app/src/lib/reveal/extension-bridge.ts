// Detect whether the slidesync Chrome extension is installed.
// The extension's content script (content/reveal-bridge.js) announces itself
// via window.postMessage on load ("ready") and replies to "ping" requests
// with "pong". Either message proves the extension is present.

const PAGE_SOURCE = "slidesync-page";
const EXT_SOURCE = "slidesync-extension";

type DetectResult = { available: boolean; version?: string };

type ExtMessage =
  | { source: typeof EXT_SOURCE; type: "ready"; version: string }
  | { source: typeof EXT_SOURCE; type: "pong"; id: string; version: string };

let extReady = false;
let extVersion: string | null = null;
let initialized = false;

const pending = new Map<
  string,
  { resolve: (result: DetectResult) => void; timer: ReturnType<typeof setTimeout> }
>();

// Resolve every in-flight detection as available. Safe to delete from the Map
// while iterating it.
function settleAll(version: string) {
  for (const [id, entry] of pending) {
    clearTimeout(entry.timer);
    pending.delete(id);
    entry.resolve({ available: true, version });
  }
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data as ExtMessage | undefined;
    if (!data || data.source !== EXT_SOURCE) return;

    // Both "ready" (announced on injection) and "pong" (reply to our ping)
    // prove the extension is live. Mark it and settle any in-flight detection.
    //
    // The settle-on-"ready" is the important part: the content script injects
    // at document_idle, and on a fast (warm) page reload the app can send its
    // ping *before* that — the ping is lost, then "ready" arrives. Without
    // settling here, that detection would wait out its timeout and wrongly
    // report the extension as missing.
    if (data.type === "ready" || data.type === "pong") {
      extReady = true;
      extVersion = data.version;
      settleAll(data.version);
    }
  });
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ping(id: string) {
  window.postMessage({ source: PAGE_SOURCE, type: "ping", id }, "*");
}

export async function detectExtension(timeoutMs = 2500): Promise<DetectResult> {
  init();
  if (typeof window === "undefined") return { available: false };
  if (extReady) return { available: true, version: extVersion ?? undefined };

  return new Promise((resolve) => {
    const id = nextId();
    const timer = setTimeout(() => {
      pending.delete(id);
      // Belt-and-suspenders: a "ready"/"pong" may have set the flag without
      // flowing through this entry.
      resolve(
        extReady
          ? { available: true, version: extVersion ?? undefined }
          : { available: false },
      );
    }, timeoutMs);
    pending.set(id, { resolve, timer });

    ping(id);
    // Re-ping partway through the window. Covers the reverse race: the content
    // script injected just after our first ping (so it missed it) but never
    // emits a fresh "ready" for this page — a second ping, now that it is
    // listening, still gets a "pong".
    setTimeout(() => {
      if (pending.has(id)) ping(id);
    }, 400);
  });
}
