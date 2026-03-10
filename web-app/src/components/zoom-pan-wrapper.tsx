"use client";

import { useZoomPan } from "@/hooks/use-zoom-pan";

interface ZoomPanWrapperProps {
  children: React.ReactNode;
  annotationMode: boolean;
}

export default function ZoomPanWrapper({ children, annotationMode }: ZoomPanWrapperProps) {
  const { scale, translateX, translateY, resetZoom, handlers } = useZoomPan();

  // When annotation mode is on:
  //   - scale > 1: "none" — JS handles pan/zoom, block browser defaults
  //   - scale === 1: "pan-y" — let browser handle vertical scroll between slides
  // When annotation mode is off: "auto" — normal browser behavior
  const touchAction = annotationMode
    ? scale > 1 ? "none" : "pan-y"
    : "auto";

  return (
    <div
      style={{ overflow: "hidden", position: "relative", touchAction }}
      {...(annotationMode ? handlers : {})}
    >
      <div
        style={{
          transform: `scale(${scale}) translate(${translateX * 100}%, ${translateY * 100}%)`,
          transformOrigin: "center center",
          willChange: scale > 1 ? "transform" : "auto",
        }}
      >
        {children}
      </div>
      {scale > 1 && (
        <button
          onClick={resetZoom}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(0,0,0,0.6)",
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            cursor: "pointer",
            zIndex: 10,
          }}
        >
          Reset zoom
        </button>
      )}
    </div>
  );
}
