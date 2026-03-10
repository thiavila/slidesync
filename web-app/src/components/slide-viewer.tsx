"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAnnotations } from "@/hooks/use-annotations";
import AnnotationCanvas from "@/components/annotation-canvas";
import AnnotationToolbar from "@/components/annotation-toolbar";
import ZoomPanWrapper from "@/components/zoom-pan-wrapper";

interface SlideViewerProps {
  slides: Map<number, string>;
  currentSlide: number;
  roomCode: string;
}

const IDLE_TIMEOUT = 30_000;

export default function SlideViewer({ slides, currentSlide, roomCode }: SlideViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Annotation state
  const [annotationMode, setAnnotationMode] = useState(false);
  const [activeTool, setActiveTool] = useState<"pen" | "eraser" | "text">("pen");
  const [color, setColor] = useState("#ef4444");
  const [lineWidth, setLineWidth] = useState(0.004);
  const fontSize = 0.02;
  const lastInteractedSlide = useRef<number | null>(null);

  const {
    loadSlide,
    getSlideAnnotation,
    addStroke,
    addTextNote,
    undo,
    clearSlide,
  } = useAnnotations(roomCode);

  const visibleSlides = Array.from(slides.entries())
    .filter(([num]) => num <= currentSlide)
    .sort(([a], [b]) => a - b);

  // Load annotations for visible slides
  const slideKeys = visibleSlides.map(([num]) => num).join(",");
  useEffect(() => {
    visibleSlides.forEach(([num]) => loadSlide(num));
  }, [slideKeys, loadSlide]);

  // Track which slide was last drawn on
  const handleSlideInteract = useCallback((slideNumber: number) => {
    lastInteractedSlide.current = slideNumber;
  }, []);

  // Get the slide to apply undo/clear to
  const getActiveSlide = (): number | null => {
    if (lastInteractedSlide.current !== null) return lastInteractedSlide.current;
    if (visibleSlides.length > 0) return visibleSlides[visibleSlides.length - 1][0];
    return null;
  };

  // User interacted → pause auto-follow, restart idle timer
  const handleUserInteraction = useCallback(() => {
    setAutoFollow(false);

    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setAutoFollow(true);
    }, IDLE_TIMEOUT);
  }, []);

  // Listen for scroll/touch interactions on the window
  useEffect(() => {
    let lastScrollY = window.scrollY;

    const onScroll = () => {
      if (window.scrollY < lastScrollY) {
        handleUserInteraction();
      }
      lastScrollY = window.scrollY;
    };

    const onTouch = (e: TouchEvent) => {
      if (annotationMode) return;
      handleUserInteraction();
    };

    window.addEventListener("scroll", onScroll);
    window.addEventListener("touchstart", onTouch);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", onTouch);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [handleUserInteraction, annotationMode]);

  // Auto-scroll to bottom when following
  useEffect(() => {
    if (autoFollow) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentSlide, slides, autoFollow]);

  if (visibleSlides.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Aguardando o professor iniciar a apresentacao...
      </div>
    );
  }

  return (
    <div id="slide-container" className="space-y-4 p-4 max-w-4xl mx-auto">
      {visibleSlides.map(([slideNumber, imageData]) => (
        <div
          key={slideNumber}
          className="bg-white rounded-lg shadow overflow-hidden"
        >
          <ZoomPanWrapper annotationMode={annotationMode}>
            <AnnotationCanvas
              slideNumber={slideNumber}
              imageData={imageData}
              annotation={getSlideAnnotation(slideNumber)}
              annotationMode={annotationMode}
              activeTool={activeTool}
              color={color}
              lineWidth={lineWidth}
              fontSize={fontSize}
              onStroke={addStroke}
              onTextNote={addTextNote}
              onInteract={handleSlideInteract}
            />
          </ZoomPanWrapper>
        </div>
      ))}
      <div ref={bottomRef} />

      {/* Annotation mode toggle FAB - bottom left */}
      <button
        onClick={() => setAnnotationMode(!annotationMode)}
        className={`fixed bottom-4 left-4 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition z-50 ${
          annotationMode
            ? "bg-blue-600 text-white"
            : "bg-white text-gray-600 border border-gray-200"
        }`}
        title={annotationMode ? "Sair do modo anotacao" : "Anotar slides"}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>

      {/* Toolbar when annotation mode is active */}
      {annotationMode && (
        <AnnotationToolbar
          activeTool={activeTool}
          color={color}
          lineWidth={lineWidth}
          onToolChange={setActiveTool}
          onColorChange={setColor}
          onLineWidthChange={setLineWidth}
          onUndo={() => {
            const slideNum = getActiveSlide();
            if (slideNum !== null) undo(slideNum);
          }}
          onClear={() => {
            const slideNum = getActiveSlide();
            if (slideNum !== null && confirm("Limpar todas as anotacoes deste slide?")) {
              clearSlide(slideNum);
            }
          }}
        />
      )}

      {!autoFollow && (
        <button
          onClick={() => {
            setAutoFollow(true);
            if (idleTimer.current) clearTimeout(idleTimer.current);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
          className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium hover:bg-blue-700 transition z-50"
        >
          Seguir apresentacao ao vivo
        </button>
      )}
    </div>
  );
}
