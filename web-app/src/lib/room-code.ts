export function generateRoomCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function readRoomCodeFromPath(prefix: string): string | null {
  if (typeof window === "undefined") return null;
  const segs = window.location.pathname.split(prefix);
  if (segs.length < 2) return null;
  const code = segs[1].replace(/\/$/, "");
  return code || null;
}
