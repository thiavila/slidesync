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

/** Composite slide image + annotations into a single canvas, returns data URL */
export async function compositeSlide(
  imageData: string,
  annotation: SlideAnnotation | undefined
): Promise<string> {
  const img = await loadImage(imageData);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(img, 0, 0);

  if (annotation && (annotation.strokes.length > 0 || annotation.textNotes.length > 0)) {
    renderAnnotations(ctx, annotation, canvas.width, canvas.height);
  }

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
