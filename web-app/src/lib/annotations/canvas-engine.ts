import type { Stroke, TextNote, SlideAnnotation, Point } from "./types";

/** Convert normalized (0-1) point to canvas pixel coordinates */
function toCanvas(p: Point, w: number, h: number): { x: number; y: number } {
  return { x: p.x * w, y: p.y * h };
}

/** Render a single stroke onto a canvas context */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  canvasWidth: number,
  canvasHeight: number
) {
  if (stroke.points.length < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.lineWidth * canvasWidth;

  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color;
  }

  ctx.beginPath();
  const first = toCanvas(stroke.points[0], canvasWidth, canvasHeight);
  ctx.moveTo(first.x, first.y);

  for (let i = 1; i < stroke.points.length; i++) {
    const p = toCanvas(stroke.points[i], canvasWidth, canvasHeight);
    ctx.lineTo(p.x, p.y);
  }

  ctx.stroke();
  ctx.restore();
}

/** Render a text note onto a canvas context */
export function renderTextNote(
  ctx: CanvasRenderingContext2D,
  note: TextNote,
  canvasWidth: number,
  canvasHeight: number
) {
  ctx.save();
  const pos = toCanvas(note.position, canvasWidth, canvasHeight);
  const fontSize = note.fontSize * canvasWidth;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = note.color;
  ctx.textBaseline = "top";

  // Word wrap
  const maxWidth = canvasWidth - pos.x - 10;
  const lines = wrapText(ctx, note.text, maxWidth);
  lines.forEach((line, i) => {
    ctx.fillText(line, pos.x, pos.y + i * fontSize * 1.2);
  });

  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (maxWidth <= 0) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/** Render all annotations onto a canvas context */
export function renderAnnotations(
  ctx: CanvasRenderingContext2D,
  annotation: SlideAnnotation,
  canvasWidth: number,
  canvasHeight: number
) {
  // Sort all items by timestamp to maintain correct layering
  const items = [
    ...annotation.strokes.map((s) => ({ type: "stroke" as const, item: s, ts: s.timestamp })),
    ...annotation.textNotes.map((t) => ({ type: "text" as const, item: t, ts: t.timestamp })),
  ].sort((a, b) => a.ts - b.ts);

  for (const entry of items) {
    if (entry.type === "stroke") {
      renderStroke(ctx, entry.item as Stroke, canvasWidth, canvasHeight);
    } else {
      renderTextNote(ctx, entry.item as TextNote, canvasWidth, canvasHeight);
    }
  }
}

export interface CompositeOptions {
  format?: "png" | "jpeg";
  quality?: number;
  maxDim?: number;
}

export interface CompositedSlide {
  dataUrl: string;
  width: number;
  height: number;
}

/** Composite slide image + annotations into a single canvas, returns data URL */
export async function compositeSlide(
  imageData: string,
  annotation: SlideAnnotation | undefined,
  options: CompositeOptions = {}
): Promise<CompositedSlide> {
  const { format = "png", quality = 0.92, maxDim } = options;
  const img = await loadImage(imageData);

  let width = img.naturalWidth;
  let height = img.naturalHeight;
  if (maxDim && Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(img, 0, 0, width, height);

  if (annotation && (annotation.strokes.length > 0 || annotation.textNotes.length > 0)) {
    renderAnnotations(ctx, annotation, width, height);
  }

  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const dataUrl = format === "jpeg" ? canvas.toDataURL(mime, quality) : canvas.toDataURL(mime);
  return { dataUrl, width, height };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
