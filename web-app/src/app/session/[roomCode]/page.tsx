"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeSession } from "@/hooks/use-realtime-session";
import SlideViewer from "@/components/slide-viewer";
import type { SlideImage } from "@/types/database";

export default function StudentSessionPage() {
  const params = useParams();
  const roomCode = params.roomCode as string;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [slides, setSlides] = useState<SlideImage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { session, error: realtimeError } = useRealtimeSession(sessionId);

  useEffect(() => {
    async function loadSession() {
      const supabase = createClient();

      const { data: sessionData, error } = await supabase
        .from("sessions")
        .select("id")
        .eq("room_code", roomCode)
        .eq("status", "active")
        .single();

      if (error || !sessionData) {
        setLoadError("Sala nao encontrada ou aula encerrada");
        return;
      }

      setSessionId(sessionData.id);

      const { data: slideData } = await supabase
        .from("slide_images")
        .select("*")
        .eq("session_id", sessionData.id)
        .order("slide_number");

      if (slideData) {
        setSlides(slideData);
      }
    }

    loadSession();
  }, [roomCode]);

  if (loadError) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <p className="text-red-500 text-lg">{loadError}</p>
          <a href="/" className="text-blue-600 hover:underline">
            Voltar ao inicio
          </a>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Carregando...</p>
      </main>
    );
  }

  if (session.status === "ended") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <p className="text-gray-700 text-lg">A aula foi encerrada</p>
          <a href="/" className="text-blue-600 hover:underline">
            Voltar ao inicio
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm p-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-gray-900">
              {session.presentation_title || "Apresentacao"}
            </h1>
            <p className="text-sm text-gray-500">
              Slide {session.current_slide} de {session.total_slides}
            </p>
          </div>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
            Ao vivo
          </span>
        </div>
      </header>

      <SlideViewer slides={slides} currentSlide={session.current_slide} />

      {realtimeError && (
        <div className="fixed bottom-4 left-4 right-4 bg-red-100 text-red-700 p-3 rounded-lg text-sm text-center">
          Erro na conexao: {realtimeError}
        </div>
      )}
    </main>
  );
}
