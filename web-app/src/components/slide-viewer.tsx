"use client";

import { useEffect, useRef } from "react";
import type { SlideImage } from "@/types/database";

interface SlideViewerProps {
  slides: SlideImage[];
  currentSlide: number;
}

export default function SlideViewer({ slides, currentSlide }: SlideViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const visibleSlides = slides
    .filter((s) => s.slide_number <= currentSlide)
    .sort((a, b) => a.slide_number - b.slide_number);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSlide]);

  if (visibleSlides.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Aguardando o professor iniciar...
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      {visibleSlides.map((slide) => (
        <div
          key={slide.id}
          className="bg-white rounded-lg shadow overflow-hidden"
        >
          <div className="relative">
            <img
              src={slide.thumbnail_url}
              alt={`Slide ${slide.slide_number}`}
              className="w-full h-auto"
              loading="lazy"
            />
            <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
              {slide.slide_number}
            </span>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
