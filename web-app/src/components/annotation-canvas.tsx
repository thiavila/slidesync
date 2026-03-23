"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { Stroke, TextNote, SlideAnnotation, Point } from "@/lib/annotations/types";
import { renderAnnotations } from "@/lib/annotations/canvas-engine";
import { useTranslations } from "@/lib/i18n/use-translations";

interface SafariTouch extends Touch {
  touchType?: "direct" | "stylus";
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface AnnotationCanvasProps {
  slideNumber: number;
  imageData: string;
  annotation: SlideAnnotation;
  annotationMode: boolean;
  activeTool: "pen" | "eraser" | "text";
  color: string;
  lineWidth: number;
  fontSize: number;
  onStroke: (slideNumber: number, stroke: Stroke) => void;
  onTextNote: (slideNumber: number, note: TextNote) => void;
  onInteract?: (slideNumber: number) => void;
}

export default function AnnotationCanvas({
  slideNumber,
  imageData,
  annotation,
  annotationMode,
  activeTool,
  color,
  lineWidth,
  fontSize,
  onStroke,
  onTextNote,
  onInteract,
}: AnnotationCanvasProps) {
  const { t } = useTranslations();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isDrawing = useRef(false);
  const currentPoints = useRef<Point[]>([]);
  const [textInput, setTextInput] = useState<{ x: number; y: number; nx: number; ny: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  // Refs for values used inside native event listeners (avoids re-registering)
  const annotationRef = useRef(annotation);
  annotationRef.current = annotation;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const colorRef = useRef(color);
  colorRef.current = color;
  const lineWidthRef = useRef(lineWidth);
  lineWidthRef.current = lineWidth;
  const onStrokeRef = useRef(onStroke);
  onStrokeRef.current = onStroke;
  const onTextNoteRef = useRef(onTextNote);
  onTextNoteRef.current = onTextNote;
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderAnnotations(ctx, annotationRef.current, canvas.width, canvas.height);
  }, []); // stable — reads from ref

  // Sync canvas size with image
  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const syncSize = () => {
      const rect = img.getBoundingClientRect();
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      canvas.width = img.naturalWidth || rect.width;
      canvas.height = img.naturalHeight || rect.height;
      redraw();
    };

    if (img.complete) {
      syncSize();
    }
    img.addEventListener("load", syncSize);

    const observer = new ResizeObserver(syncSize);
    observer.observe(img);

    return () => {
      img.removeEventListener("load", syncSize);
      observer.disconnect();
    };
  }, [imageData, redraw]);

  // Redraw when annotations change
  useEffect(() => {
    redraw();
  }, [annotation, redraw]);

  // Normalize pointer to 0-1 coordinates
  const normalizePoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      };
    },
    []
  );
  const normalizePointRef = useRef(normalizePoint);
  normalizePointRef.current = normalizePoint;

  // Native pointer event listeners on the container.
  // Canvas has pointer-events:none — it only renders.
  // iPad: finger scrolls, Apple Pencil draws (touch events filtered).
  // iPhone/other: finger draws (touch events allowed).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !annotationMode) return;

    // iPad reports as Macintosh with touch support (iPadOS 13+)
    const isIPad = navigator.maxTouchPoints > 1 &&
      /Macintosh|iPad/.test(navigator.userAgent);

    const onPointerDown = (e: PointerEvent) => {
      if (isIPad && e.pointerType === "touch") return; // iPad: let finger scroll
      e.preventDefault();
      onInteractRef.current?.(slideNumber);

      if (activeToolRef.current === "text") {
        const normalized = normalizePointRef.current(e.clientX, e.clientY);
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        setTextInput({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          nx: normalized.x,
          ny: normalized.y,
        });
        setTextValue("");
        setTimeout(() => textInputRef.current?.focus(), 0);
        return;
      }

      isDrawing.current = true;
      currentPoints.current = [normalizePointRef.current(e.clientX, e.clientY)];
      container.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isIPad && e.pointerType === "touch") return;
      if (!isDrawing.current) return;
      e.preventDefault();

      const point = normalizePointRef.current(e.clientX, e.clientY);
      currentPoints.current.push(point);

      // Live preview
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderAnnotations(ctx, annotationRef.current, canvas.width, canvas.height);

      if (currentPoints.current.length >= 2) {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = lineWidthRef.current * canvas.width;

        if (activeToolRef.current === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
          ctx.strokeStyle = "rgba(0,0,0,1)";
        } else {
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = colorRef.current;
        }

        ctx.beginPath();
        const first = currentPoints.current[0];
        ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
        for (let i = 1; i < currentPoints.current.length; i++) {
          const p = currentPoints.current[i];
          ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
        }
        ctx.stroke();
        ctx.restore();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isIPad && e.pointerType === "touch") return;
      if (!isDrawing.current) return;
      isDrawing.current = false;

      if (currentPoints.current.length >= 2) {
        const stroke: Stroke = {
          id: genId(),
          tool: activeToolRef.current as "pen" | "eraser",
          points: [...currentPoints.current],
          color: colorRef.current,
          lineWidth: lineWidthRef.current,
          timestamp: Date.now(),
        };
        onStrokeRef.current(slideNumber, stroke);
      }
      currentPoints.current = [];
    };

    // Prevent Safari from scrolling during drawing.
    // iPad: only block scroll for Apple Pencil (stylus), finger scrolls normally.
    // iPhone/other: block scroll for all touches (finger is the drawing tool).
    const onTouchStart = (e: TouchEvent) => {
      if (isIPad) {
        for (let i = 0; i < e.touches.length; i++) {
          if ((e.touches[i] as SafariTouch).touchType === "stylus") {
            e.preventDefault();
            return;
          }
        }
      } else {
        e.preventDefault();
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isIPad) {
        for (let i = 0; i < e.touches.length; i++) {
          if ((e.touches[i] as SafariTouch).touchType === "stylus") {
            e.preventDefault();
            return;
          }
        }
      } else {
        e.preventDefault();
      }
    };

    container.addEventListener("pointerdown", onPointerDown, { passive: false });
    container.addEventListener("pointermove", onPointerMove, { passive: false });
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("touchstart", onTouchStart, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
    };
  }, [annotationMode, slideNumber]);

  const handleTextSubmit = useCallback(() => {
    if (!textInput || !textValue.trim()) {
      setTextInput(null);
      setTextValue("");
      return;
    }

    const note: TextNote = {
      id: genId(),
      position: { x: textInput.nx, y: textInput.ny },
      text: textValue.trim(),
      color,
      fontSize,
      timestamp: Date.now(),
    };
    onTextNote(slideNumber, note);
    setTextInput(null);
    setTextValue("");
  }, [textInput, textValue, color, fontSize, slideNumber, onTextNote]);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{
        cursor: annotationMode
          ? activeTool === "text"
            ? "text"
            : "crosshair"
          : "default",
      }}
    >
      <img
        ref={imgRef}
        src={imageData}
        alt={`Slide ${slideNumber}`}
        className="w-full h-auto"
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0"
        style={{ pointerEvents: "none" }}
      />
      {textInput && (
        <input
          ref={textInputRef}
          type="text"
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleTextSubmit();
            if (e.key === "Escape") {
              setTextInput(null);
              setTextValue("");
            }
          }}
          onBlur={handleTextSubmit}
          className="absolute bg-white/90 border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:border-blue-500"
          style={{
            left: textInput.x,
            top: textInput.y,
            minWidth: 120,
            color,
          }}
          placeholder={t("viewer.textPlaceholder")}
        />
      )}
      <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
        {slideNumber}
      </span>
    </div>
  );
}
