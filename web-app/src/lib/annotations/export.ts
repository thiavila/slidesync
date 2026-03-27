import type { SlideAnnotation } from "./types";
import { compositeSlide } from "./canvas-engine";
import { getAnnotation, getAllSlideNumbers } from "./storage";

interface ExportInput {
  roomCode: string;
  slides: Map<number, string>;
  currentSlide: number;
  onProgress?: (current: number, total: number) => void;
}

async function getCompositedSlides(
  input: ExportInput
): Promise<{ slideNumber: number; dataUrl: string }[]> {
  const visibleSlides = Array.from(input.slides.entries())
    .filter(([num]) => num <= input.currentSlide)
    .sort(([a], [b]) => a - b);

  const total = visibleSlides.length;
  const results: { slideNumber: number; dataUrl: string }[] = [];

  for (let i = 0; i < visibleSlides.length; i++) {
    const [slideNumber, imageData] = visibleSlides[i];
    const annotation = await getAnnotation(input.roomCode, slideNumber);
    const dataUrl = await compositeSlide(imageData, annotation);
    results.push({ slideNumber, dataUrl });
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
  const composited = await getCompositedSlides(input);

  if (composited.length === 0) return;

  // Use first slide to determine aspect ratio
  const firstImg = await loadImageDimensions(composited[0].dataUrl);
  const pdf = new jsPDF({
    orientation: firstImg.width > firstImg.height ? "landscape" : "portrait",
    unit: "px",
    format: [firstImg.width, firstImg.height],
  });

  for (let i = 0; i < composited.length; i++) {
    if (i > 0) {
      const dims = await loadImageDimensions(composited[i].dataUrl);
      pdf.addPage([dims.width, dims.height], dims.width > dims.height ? "landscape" : "portrait");
    }
    const dims = await loadImageDimensions(composited[i].dataUrl);
    pdf.addImage(composited[i].dataUrl, "PNG", 0, 0, dims.width, dims.height);
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

function loadImageDimensions(
  src: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}
