"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { Stroke, TextNote, SlideAnnotation, Point } from "@/lib/annotations/types";
import { renderAnnotations } from "@/lib/annotations/canvas-engine";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isDrawing = useRef(false);
  const currentPoints = useRef<Point[]>([]);
  const [textInput, setTextInput] = useState<{ x: number; y: number; nx: number; ny: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  // Use ref for annotation so syncSize always has latest data
  const annotationRef = useRef(annotation);
  annotationRef.current = annotation;

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!annotationMode) return;
      onInteract?.(slideNumber);

      if (activeTool === "text") {
        const normalized = normalizePoint(e.clientX, e.clientY);
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
      currentPoints.current = [normalizePoint(e.clientX, e.clientY)];

      const canvas = canvasRef.current!;
      canvas.setPointerCapture(e.pointerId);
    },
    [annotationMode, activeTool, normalizePoint, onInteract, slideNumber]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawing.current || !annotationMode) return;

      const point = normalizePoint(e.clientX, e.clientY);
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
        ctx.lineWidth = lineWidth * canvas.width;

        if (activeTool === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
          ctx.strokeStyle = "rgba(0,0,0,1)";
        } else {
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = color;
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
    },
    [annotationMode, activeTool, color, lineWidth, normalizePoint]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawing.current) return;
      isDrawing.current = false;

      if (currentPoints.current.length >= 2) {
        const stroke: Stroke = {
          id: genId(),
          tool: activeTool as "pen" | "eraser",
          points: [...currentPoints.current],
          color,
          lineWidth,
          timestamp: Date.now(),
        };
        onStroke(slideNumber, stroke);
      }
      currentPoints.current = [];
    },
    [activeTool, color, lineWidth, slideNumber, onStroke]
  );

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
    <div ref={containerRef} className="relative">
      <img
        ref={imgRef}
        src={imageData}
        alt={`Slide ${slideNumber}`}
        className="w-full h-auto"
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0"
        style={{
          touchAction: annotationMode ? "none" : "auto",
          pointerEvents: annotationMode ? "auto" : "none",
          cursor: annotationMode
            ? activeTool === "text"
              ? "text"
              : "crosshair"
            : "default",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
          placeholder="Digite aqui..."
        />
      )}
      <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
        {slideNumber}
      </span>
    </div>
  );
}
