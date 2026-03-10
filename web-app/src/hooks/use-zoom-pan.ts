import { useRef, useState, useCallback } from "react";

interface ZoomPanState {
  scale: number;
  translateX: number;
  translateY: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_THRESHOLD = 300;

export function useZoomPan() {
  const [state, setState] = useState<ZoomPanState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  const touches = useRef(new Map<number, { x: number; y: number }>());
  const lastTapTime = useRef(0);
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchMid = useRef<{ x: number; y: number } | null>(null);
  const lastPanPos = useRef<{ x: number; y: number } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const clampTranslate = useCallback(
    (tx: number, ty: number, s: number) => {
      // When zoomed, limit panning so the image doesn't leave the viewport
      const maxT = (s - 1) / (2 * s);
      return {
        x: Math.max(-maxT, Math.min(maxT, tx)),
        y: Math.max(-maxT, Math.min(maxT, ty)),
      };
    },
    []
  );

  const resetZoom = useCallback(() => {
    setState({ scale: 1, translateX: 0, translateY: 0 });
    touches.current.clear();
    lastPinchDist.current = null;
    lastPinchMid.current = null;
    lastPanPos.current = null;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;

      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (touches.current.size === 1) {
        // Double-tap detection
        const now = Date.now();
        if (now - lastTapTime.current < DOUBLE_TAP_THRESHOLD) {
          resetZoom();
          lastTapTime.current = 0;
          return;
        }
        lastTapTime.current = now;

        // Start pan only if zoomed
        if (stateRef.current.scale > 1) {
          lastPanPos.current = { x: e.clientX, y: e.clientY };
          (e.target as Element).setPointerCapture(e.pointerId);
          e.preventDefault();
        }
        // If scale === 1, don't capture — let browser handle scroll
      }

      if (touches.current.size === 2) {
        // Start pinch
        const pts = Array.from(touches.current.values());
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        lastPinchDist.current = Math.hypot(dx, dy);
        lastPinchMid.current = {
          x: (pts[0].x + pts[1].x) / 2,
          y: (pts[0].y + pts[1].y) / 2,
        };
        lastPanPos.current = null;
        e.preventDefault();
      }
    },
    [resetZoom]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (!touches.current.has(e.pointerId)) return;

      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Pinch zoom with 2 fingers
      if (touches.current.size === 2 && lastPinchDist.current !== null) {
        const pts = Array.from(touches.current.values());
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        const dist = Math.hypot(dx, dy);

        const ratio = dist / lastPinchDist.current;
        const { scale, translateX, translateY } = stateRef.current;
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * ratio));

        const clamped = clampTranslate(translateX, translateY, newScale);

        setState({ scale: newScale, translateX: clamped.x, translateY: clamped.y });
        lastPinchDist.current = dist;
        e.preventDefault();
        return;
      }

      // Pan with 1 finger (only when zoomed)
      if (touches.current.size === 1 && lastPanPos.current) {
        const { scale, translateX, translateY } = stateRef.current;
        const target = e.target as Element;
        const rect = target.getBoundingClientRect();

        const dx = (e.clientX - lastPanPos.current.x) / rect.width;
        const dy = (e.clientY - lastPanPos.current.y) / rect.height;

        const clamped = clampTranslate(
          translateX + dx / scale,
          translateY + dy / scale,
          scale
        );

        setState({ scale, translateX: clamped.x, translateY: clamped.y });
        lastPanPos.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    },
    [clampTranslate]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touches.current.delete(e.pointerId);

    if (touches.current.size < 2) {
      lastPinchDist.current = null;
      lastPinchMid.current = null;
    }
    if (touches.current.size === 0) {
      lastPanPos.current = null;
    }
  }, []);

  return {
    scale: state.scale,
    translateX: state.translateX,
    translateY: state.translateY,
    resetZoom,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
  };
}
