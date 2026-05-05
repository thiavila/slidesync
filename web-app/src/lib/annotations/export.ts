import type { SlideAnnotation } from "./types";
import { compositeSlide, type CompositeOptions } from "./canvas-engine";
import { getAnnotation, getAllSlideNumbers } from "./storage";

interface ExportInput {
  roomCode: string;
  slides: Map<number, string>;
  currentSlide: number;
  onProgress?: (current: number, total: number) => void;
}

interface CompositedResult {
  slideNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

async function getCompositedSlides(
  input: ExportInput,
  options: CompositeOptions = {}
): Promise<CompositedResult[]> {
  const visibleSlides = Array.from(input.slides.entries())
    .filter(([num]) => num <= input.currentSlide)
    .sort(([a], [b]) => a - b);

  const total = visibleSlides.length;
  const results: CompositedResult[] = [];

  for (let i = 0; i < visibleSlides.length; i++) {
    const [slideNumber, imageData] = visibleSlides[i];
    const annotation = await getAnnotation(input.roomCode, slideNumber);
    const { dataUrl, width, height } = await compositeSlide(imageData, annotation, options);
    results.push({ slideNumber, dataUrl, width, height });
    input.onProgress?.(i + 1, total);
  }

  return results;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportAsPdf(input: ExportInput): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const composited = await getCompositedSlides(input, {
    format: "jpeg",
    quality: 0.95,
    maxDim: 2560,
  });

  if (composited.length === 0) return;

  const first = composited[0];
  const pdf = new jsPDF({
    orientation: first.width > first.height ? "landscape" : "portrait",
    unit: "px",
    format: [first.width, first.height],
    compress: true,
  });

  for (let i = 0; i < composited.length; i++) {
    const { dataUrl, width, height } = composited[i];
    if (i > 0) {
      pdf.addPage([width, height], width > height ? "landscape" : "portrait");
    }
    pdf.addImage(dataUrl, "JPEG", 0, 0, width, height, undefined, "FAST");
  }

  pdf.save(`slides-${input.roomCode}.pdf`);
}

export async function exportAsZip(input: ExportInput): Promise<void> {
  const { zipSync, strToU8 } = await import("fflate");
  const composited = await getCompositedSlides(input);

  if (composited.length === 0) return;

  const files: Record<string, Uint8Array> = {};
  for (const { slideNumber, dataUrl } of composited) {
    const name = `slide-${String(slideNumber).padStart(2, "0")}.png`;
    files[name] = dataUrlToUint8Array(dataUrl);
  }

  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
  downloadBlob(blob, `slides-${input.roomCode}.zip`);
}
