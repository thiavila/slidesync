"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAnnotations } from "@/hooks/use-annotations";
import AnnotationCanvas from "@/components/annotation-canvas";
import AnnotationToolbar from "@/components/annotation-toolbar";
import { useTranslations } from "@/lib/i18n/use-translations";

interface SlideViewerProps {
  slides: Map<number, string>;
  currentSlide: number;
  roomCode: string;
}

// How close to the end of the page counts as "at the last slide" (CSS px).
const BOTTOM_THRESHOLD = 100;

// How long a programmatic smooth scroll is allowed to run before we start
// trusting scroll positions again.
const SCROLL_SETTLE = 1_000;

// Grace period after a gesture interrupts a scroll, before re-reading position.
const GESTURE_SETTLE = 250;

// Bottom of what the user actually sees, in document coordinates.
// visualViewport accounts for pinch-zoom: zoomed into the middle of a slide
// means the visible bottom is far from the end of the page.
function isNearBottom(): boolean {
  const vv = window.visualViewport;
  const visibleBottom =
    window.scrollY + (vv ? vv.offsetTop + vv.height : window.innerHeight);
  return document.documentElement.scrollHeight - visibleBottom <= BOTTOM_THRESHOLD;
}

export default function SlideViewer({ slides, currentSlide, roomCode }: SlideViewerProps) {
  const { t } = useTranslations();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-follow is not a mode the user toggles — it is simply "is the viewer
  // parked at the end of the page". Kept in a ref because it has to be read as
  // it was *before* a new slide grew the page.
  const followRef = useRef(true);
  const programmaticRef = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const scrollToBottom = useCallback((smooth = true) => {
    programmaticRef.current = true;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      programmaticRef.current = false;
      // followRef still true means no scroll event ever arrived — either the
      // smooth scroll was a no-op or it fell short. Snap to the end.
      if (followRef.current && !isNearBottom()) {
        bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      }
      followRef.current = isNearBottom();
    }, SCROLL_SETTLE);

    bottomRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "end",
    });
  }, []);

  // Track whether the viewer is parked at the end of the page.
  useEffect(() => {
    const onScroll = () => {
      // Ignore the scroll events our own scrollIntoView generates.
      if (programmaticRef.current) return;
      followRef.current = isNearBottom();
    };

    // A real gesture aborts any in-flight smooth scroll, in the browser and
    // here. Where it leaves the page is only known once the gesture settles.
    const onUserTakeover = () => {
      programmaticRef.current = false;
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        followRef.current = isNearBottom();
      }, GESTURE_SETTLE);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", onUserTakeover, { passive: true });
    window.addEventListener("wheel", onUserTakeover, { passive: true });
    window.addEventListener("keydown", onUserTakeover);
    window.visualViewport?.addEventListener("scroll", onScroll);
    window.visualViewport?.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", onUserTakeover);
      window.removeEventListener("wheel", onUserTakeover);
      window.removeEventListener("keydown", onUserTakeover);
      window.visualViewport?.removeEventListener("scroll", onScroll);
      window.visualViewport?.removeEventListener("resize", onScroll);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  // New slide arrived → only follow if the viewer was already at the end.
  useEffect(() => {
    if (followRef.current) scrollToBottom();
  }, [currentSlide, slides, scrollToBottom]);

  // Slide images have no intrinsic height until they load, so the page keeps
  // growing after the scroll. Re-anchor to the bottom while following.
  // A callback ref, not an effect: the container only mounts once the first
  // slide arrives, long after the initial "waiting" render.
  const observerRef = useRef<ResizeObserver | null>(null);
  const setContainer = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node) return;

      const observer = new ResizeObserver(() => {
        if (followRef.current) scrollToBottom(false);
      });
      observer.observe(node);
      observerRef.current = observer;
    },
    [scrollToBottom]
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  if (visibleSlides.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        {t("viewer.waiting")}
      </div>
    );
  }

  return (
    <div id="slide-container" ref={setContainer} className="space-y-0.5">
      {visibleSlides.map(([slideNumber, imageData]) => (
        <div
          key={slideNumber}
          className="bg-white overflow-hidden"
        >
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
        </div>
      ))}
      <div ref={bottomRef} />

      {/* Annotation mode toggle FAB - bottom left */}
      <button
        onClick={() => setAnnotationMode(!annotationMode)}
        className={`fixed bottom-4 left-4 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition z-50 ${
          annotationMode
            ? "bg-brand text-white"
            : "bg-white text-gray-600 border border-gray-200"
        }`}
        title={annotationMode ? t("viewer.exitAnnotation") : t("viewer.annotateSlides")}
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
            if (slideNum !== null && confirm(t("viewer.clearConfirm"))) {
              clearSlide(slideNum);
            }
          }}
        />
      )}
    </div>
  );
}
