// IndexedDB-backed store for the uploaded Reveal deck HTML.
//
// Why not sessionStorage: a self-contained Reveal export with base64-embedded
// images/fonts/video easily blows past the browser's ~5MB Web Storage quota,
// so `sessionStorage.setItem` threw QuotaExceededError and blocked presenting.
// IndexedDB's quota scales with available disk (hundreds of MB+), so large
// decks fit. Persistence still survives reloads within the same browser.
//
// Thin wrapper, no dependency: one database, one object store, string values.

const DB_NAME = "slidesync";
const STORE_NAME = "kv";
const DECK_KEY = "reveal-html";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = op(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Returns the stored deck HTML, or null if absent / IndexedDB is unavailable
// (e.g. some private-browsing modes). Read failures are swallowed — a missing
// deck just sends the user back to the upload view.
export async function getDeckHtml(): Promise<string | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDB();
    try {
      const value = await run<string | undefined>(db, "readonly", (s) =>
        s.get(DECK_KEY),
      );
      return value ?? null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

// Persists the deck HTML. Rejects on real failures so the caller can decide
// how to react — but note presenting does not depend on this succeeding.
export async function setDeckHtml(html: string): Promise<void> {
  const db = await openDB();
  try {
    await run(db, "readwrite", (s) => s.put(html, DECK_KEY));
  } finally {
    db.close();
  }
}

// Best-effort removal (called when the extension ends the session). Never
// throws — failing to clean up should not surface an error to the user.
export async function clearDeckHtml(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    try {
      await run(db, "readwrite", (s) => s.delete(DECK_KEY));
    } finally {
      db.close();
    }
  } catch {
    /* best-effort cleanup */
  }
}
