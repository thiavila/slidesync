"use client";

import { useState } from "react";
import { exportAsPdf } from "@/lib/annotations/export";

interface DownloadButtonProps {
  roomCode: string;
  slides: Map<number, string>;
  currentSlide: number;
}

export default function DownloadButton({
  roomCode,
  slides,
  currentSlide,
}: DownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  const handleDownload = async () => {
    setLoading(true);
    setProgress("Preparando...");

    try {
      await exportAsPdf({
        roomCode,
        slides,
        currentSlide,
        onProgress: (current: number, total: number) => {
          setProgress(`${current}/${total}...`);
        },
      });
    } catch (err) {
      console.error("Export error:", err);
      alert("Erro ao exportar. Tente novamente.");
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  if (loading) {
    return (
      <span className="text-xs text-gray-500 animate-pulse">{progress}</span>
    );
  }

  return (
    <button
      onClick={handleDownload}
      className="text-gray-600 hover:text-gray-900 transition p-1"
      title="Baixar PDF"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </button>
  );
}
