"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import usePartySocket from "partysocket/react";
import SlideViewer from "@/components/slide-viewer";
import DownloadButton from "@/components/download-button";

const PARTY_HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

export default function StudentSessionPage() {
  const params = useParams();
  const roomCode = params.roomCode as string;
  const [slides, setSlides] = useState<Map<number, string>>(new Map());
  const [currentSlide, setCurrentSlide] = useState(1);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  const ws = usePartySocket({
    host: PARTY_HOST,
    room: roomCode,
    onOpen() {
      setConnected(true);
      setError(null);
    },
    onClose() {
      setConnected(false);
    },
    onError() {
      setError("Erro ao conectar. Sala pode nao existir.");
    },
    onMessage(event) {
      const data = JSON.parse(event.data);

      if (data.type === "init") {
        // Received initial state
        const newSlides = new Map<number, string>();
        if (data.slides) {
          Object.entries(data.slides).forEach(([num, img]) => {
            newSlides.set(parseInt(num), img as string);
          });
        }
        setSlides(newSlides);
        setCurrentSlide(data.currentSlide || 1);
      }

      if (data.type === "slide-update") {
        setSlides((prev) => {
          const next = new Map(prev);
          next.set(data.slideNumber, data.imageData);
          return next;
        });
        setCurrentSlide(data.currentSlide || data.slideNumber);
      }
    },
  });

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <p className="text-red-500 text-lg">{error}</p>
          <a href="/" className="text-blue-600 hover:underline">
            Voltar ao inicio
          </a>
        </div>
      </main>
    );
  }

  if (!connected) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Conectando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="px-4 py-1.5 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Slide {currentSlide} &middot; Sala {roomCode}
          </span>
          <div className="flex items-center gap-2">
            <DownloadButton
              roomCode={roomCode}
              slides={slides}
              currentSlide={currentSlide}
            />
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              Ao vivo
            </span>
          </div>
        </div>
      </header>

      <SlideViewer slides={slides} currentSlide={currentSlide} roomCode={roomCode} />
    </main>
  );
}
