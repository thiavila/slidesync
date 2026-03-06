"use client";

import { useEffect, useRef } from "react";

interface SlideViewerProps {
  slides: Map<number, string>;
  currentSlide: number;
}

export default function SlideViewer({ slides, currentSlide }: SlideViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const visibleSlides = Array.from(slides.entries())
    .filter(([num]) => num <= currentSlide)
    .sort(([a], [b]) => a - b);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSlide, slides]);

  if (visibleSlides.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Aguardando o professor iniciar a apresentacao...
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
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
    </div>
  );
}
