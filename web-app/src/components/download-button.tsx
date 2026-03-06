"use client";

import { useState } from "react";
import { exportAsPdf, exportAsZip } from "@/lib/annotations/export";

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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  const handleExport = async (format: "pdf" | "zip") => {
    setLoading(true);
    setProgress("Preparando...");
    setOpen(false);

    try {
      const input = {
        roomCode,
        slides,
        currentSlide,
        onProgress: (current: number, total: number) => {
          setProgress(`Processando slide ${current}/${total}...`);
        },
      };

      if (format === "pdf") {
        await exportAsPdf(input);
      } else {
        await exportAsZip(input);
      }
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
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-gray-600 hover:text-gray-900 transition p-1"
        title="Baixar slides"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[140px]">
            <button
              onClick={() => handleExport("pdf")}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
            >
              Baixar PDF
            </button>
            <button
              onClick={() => handleExport("zip")}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
            >
              Baixar ZIP (PNGs)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
