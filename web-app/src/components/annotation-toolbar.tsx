"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n/use-translations";

interface AnnotationToolbarProps {
  activeTool: "pen" | "eraser" | "text";
  color: string;
  lineWidth: number;
  onToolChange: (tool: "pen" | "eraser" | "text") => void;
  onColorChange: (color: string) => void;
  onLineWidthChange: (width: number) => void;
  onUndo: () => void;
  onClear: () => void;
}

const PRESET_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#000000"];
const LINE_WIDTHS = [
  { value: 0.002, labelKey: "toolbar.thin" },
  { value: 0.004, labelKey: "toolbar.medium" },
  { value: 0.008, labelKey: "toolbar.thick" },
];

export default function AnnotationToolbar({
  activeTool,
  color,
  lineWidth,
  onToolChange,
  onColorChange,
  onLineWidthChange,
  onUndo,
  onClear,
}: AnnotationToolbarProps) {
  const { t } = useTranslations();
  const [showColors, setShowColors] = useState(false);
  const [showSizes, setShowSizes] = useState(false);

  return (
    <div className="fixed bottom-16 left-4 z-50 flex flex-col gap-2 bg-white rounded-xl shadow-lg p-2 border border-gray-200">
      {/* Pen */}
      <button
        onClick={() => onToolChange("pen")}
        className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition ${
          activeTool === "pen"
            ? "bg-brand-light text-brand"
            : "hover:bg-gray-100 text-gray-600"
        }`}
        title={t("toolbar.pen")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>

      {/* Text */}
      <button
        onClick={() => onToolChange("text")}
        className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold transition ${
          activeTool === "text"
            ? "bg-brand-light text-brand"
            : "hover:bg-gray-100 text-gray-600"
        }`}
        title={t("toolbar.text")}
      >
        T
      </button>

      {/* Eraser */}
      <button
        onClick={() => onToolChange("eraser")}
        className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition ${
          activeTool === "eraser"
            ? "bg-brand-light text-brand"
            : "hover:bg-gray-100 text-gray-600"
        }`}
        title={t("toolbar.eraser")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
          <path d="M22 21H7" />
          <path d="m5 11 9 9" />
        </svg>
      </button>

      {/* Divider */}
      <div className="border-t border-gray-200 my-1" />

      {/* Line width / size picker */}
      <div className="relative">
        <button
          onClick={() => { setShowSizes(!showSizes); setShowColors(false); }}
          className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-gray-100 transition"
          title={t("toolbar.lineWidth")}
        >
          <div className="flex flex-col items-center gap-[3px]">
            <div className="bg-gray-600 rounded-full" style={{ width: 14, height: lineWidth === 0.002 ? 2 : lineWidth === 0.004 ? 3 : 5 }} />
          </div>
        </button>

        {showSizes && (
          <div className="absolute left-12 bottom-0 bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex flex-col gap-1">
            {LINE_WIDTHS.map((lw) => (
              <button
                key={lw.value}
                onClick={() => {
                  onLineWidthChange(lw.value);
                  setShowSizes(false);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-sm whitespace-nowrap ${
                  lineWidth === lw.value ? "bg-brand-light text-brand" : "hover:bg-gray-100 text-gray-600"
                }`}
              >
                <div className="bg-current rounded-full" style={{ width: 20, height: lw.value * 500 }} />
                {t(lw.labelKey)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Color picker */}
      <div className="relative">
        <button
          onClick={() => { setShowColors(!showColors); setShowSizes(false); }}
          className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-gray-100 transition"
          title={t("toolbar.color")}
        >
          <div
            className="w-6 h-6 rounded-full border-2 border-gray-300"
            style={{ backgroundColor: color }}
          />
        </button>

        {showColors && (
          <div className="absolute left-12 bottom-0 bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onColorChange(c);
                  setShowColors(false);
                }}
                className={`w-8 h-8 rounded-full border-2 transition ${
                  color === c ? "border-gray-800 scale-110" : "border-gray-300"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <label className="w-8 h-8 rounded-full border-2 border-dashed border-gray-400 flex items-center justify-center cursor-pointer overflow-hidden">
              <span className="text-xs text-gray-400">+</span>
              <input
                type="color"
                value={color}
                onChange={(e) => {
                  onColorChange(e.target.value);
                  setShowColors(false);
                }}
                className="absolute opacity-0 w-0 h-0"
              />
            </label>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 my-1" />

      {/* Undo */}
      <button
        onClick={onUndo}
        className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-600 transition"
        title={t("toolbar.undo")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
        </svg>
      </button>

      {/* Clear */}
      <button
        onClick={onClear}
        className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-red-50 text-red-500 transition"
        title={t("toolbar.clearAll")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
}
