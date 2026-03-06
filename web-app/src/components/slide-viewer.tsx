"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface SlideViewerProps {
  slides: Map<number, string>;
  currentSlide: number;
}

const IDLE_TIMEOUT = 30_000; // 30 seconds without interaction → resume auto-follow

export default function SlideViewer({ slides, currentSlide }: SlideViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleSlides = Array.from(slides.entries())
    .filter(([num]) => num <= currentSlide)
    .sort(([a], [b]) => a - b);

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
      // Only trigger if user scrolled UP (looking at previous slides)
      if (window.scrollY < lastScrollY) {
        handleUserInteraction();
      }
      lastScrollY = window.scrollY;
    };

    const onTouch = () => handleUserInteraction();

    window.addEventListener("scroll", onScroll);
    window.addEventListener("touchstart", onTouch);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", onTouch);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [handleUserInteraction]);

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
          <div className="relative">
            <img
              src={imageData}
              alt={`Slide ${slideNumber}`}
              className="w-full h-auto"
            />
            <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
              {slideNumber}
            </span>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />

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
