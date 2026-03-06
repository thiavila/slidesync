"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRealtimeSession } from "@/hooks/use-realtime-session";
import Link from "next/link";

export default function ProfessorSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const { session, error } = useRealtimeSession(sessionId);
  const [ending, setEnding] = useState(false);

  async function endSession() {
    if (!confirm("Encerrar esta sessao?")) return;
    setEnding(true);

    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ended" }),
    });

    if (res.ok) {
      router.push("/dashboard");
    } else {
      setEnding(false);
      alert("Erro ao encerrar sessao");
    }
  }

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Carregando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
            &larr; Dashboard
          </Link>
          {session.status === "active" && (
            <button
              onClick={endSession}
              disabled={ending}
              className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
            >
              {ending ? "Encerrando..." : "Encerrar sessao"}
            </button>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-6 text-center">
          <p className="text-sm text-gray-500 mb-2">Codigo da sala</p>
          <p className="text-6xl font-mono font-bold text-gray-900 tracking-widest">
            {session.room_code}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Compartilhe este codigo com seus alunos
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {session.presentation_title || "Apresentacao"}
          </h2>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Status</p>
              <p
                className={
                  session.status === "active"
                    ? "text-green-600 font-medium"
                    : "text-gray-600"
                }
              >
                {session.status === "active" ? "Ativa" : "Encerrada"}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Slide atual</p>
              <p className="font-medium">
                {session.current_slide} de {session.total_slides}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Chrome Extension
          </h2>
          <p className="text-sm text-gray-600">
            Use estes dados para conectar a extensao:
          </p>
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-gray-500">Session ID</p>
              <code className="bg-gray-100 px-2 py-1 rounded text-xs break-all">
                {session.id}
              </code>
            </div>
            <div>
              <p className="text-gray-500">Extension Secret</p>
              <code className="bg-gray-100 px-2 py-1 rounded text-xs break-all">
                {session.extension_secret}
              </code>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
