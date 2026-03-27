"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { SlideAnnotation, Stroke, TextNote } from "@/lib/annotations/types";
import { getAnnotation, setAnnotation, deleteAnnotation } from "@/lib/annotations/storage";

const EMPTY: SlideAnnotation = { strokes: [], textNotes: [] };
const DEBOUNCE_MS = 500;

export function useAnnotations(roomCode: string) {
  const [annotations, setAnnotations] = useState<Map<number, SlideAnnotation>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<Map<number, SlideAnnotation>>(new Map());

  // Keep ref in sync
  latestRef.current = annotations;

  // Load annotation for a specific slide
  const loadedSlides = useRef<Set<number>>(new Set());
  const loadSlide = useCallback(
    async (slideNumber: number) => {
      if (loadedSlides.current.has(slideNumber)) return;
      loadedSlides.current.add(slideNumber);
      try {
        const data = await getAnnotation(roomCode, slideNumber);
        if (data) {
          setAnnotations((prev) => {
            const next = new Map(prev);
            next.set(slideNumber, data);
            return next;
          });
        }
      } catch (e) {
        console.error("Failed to load annotation", slideNumber, e);
      }
    },
    [roomCode]
  );

  // Debounced save — always saves from latest state via ref
  const scheduleSave = useCallback(
    (slideNumber: number) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const data = latestRef.current.get(slideNumber);
        if (data) {
          try {
            await setAnnotation(roomCode, slideNumber, data);
          } catch (e) {
            console.error("Failed to save annotation", slideNumber, e);
          }
        }
      }, DEBOUNCE_MS);
    },
    [roomCode]
  );

  const getSlideAnnotation = useCallback(
    (slideNumber: number): SlideAnnotation => {
      return annotations.get(slideNumber) ?? EMPTY;
    },
    [annotations]
  );

  const addStroke = useCallback(
    (slideNumber: number, stroke: Stroke) => {
      setAnnotations((prev) => {
        const next = new Map(prev);
        const current = next.get(slideNumber) ?? { strokes: [], textNotes: [] };
        next.set(slideNumber, {
          ...current,
          strokes: [...current.strokes, stroke],
        });
        return next;
      });
      // Schedule save after state update
      setTimeout(() => scheduleSave(slideNumber), 0);
    },
    [scheduleSave]
  );

  const addTextNote = useCallback(
    (slideNumber: number, note: TextNote) => {
      setAnnotations((prev) => {
        const next = new Map(prev);
        const current = next.get(slideNumber) ?? { strokes: [], textNotes: [] };
        next.set(slideNumber, {
          ...current,
          textNotes: [...current.textNotes, note],
        });
        return next;
      });
      setTimeout(() => scheduleSave(slideNumber), 0);
    },
    [scheduleSave]
  );

  const undo = useCallback(
    (slideNumber: number) => {
      setAnnotations((prev) => {
        const current = prev.get(slideNumber);
        if (!current) return prev;

        const allItems = [
          ...current.strokes.map((s) => ({ type: "stroke" as const, ts: s.timestamp })),
          ...current.textNotes.map((t) => ({ type: "text" as const, ts: t.timestamp })),
        ];

        if (allItems.length === 0) return prev;

        allItems.sort((a, b) => b.ts - a.ts);
        const latest = allItems[0];

        const next = new Map(prev);
        if (latest.type === "stroke") {
          const strokes = current.strokes.filter((s) => s.timestamp !== latest.ts);
          next.set(slideNumber, {
            strokes: strokes.length === current.strokes.length ? current.strokes.slice(0, -1) : strokes,
            textNotes: current.textNotes,
          });
        } else {
          const textNotes = current.textNotes.filter((t) => t.timestamp !== latest.ts);
          next.set(slideNumber, {
            strokes: current.strokes,
            textNotes: textNotes.length === current.textNotes.length ? current.textNotes.slice(0, -1) : textNotes,
          });
        }

        return next;
      });
      setTimeout(() => scheduleSave(slideNumber), 0);
    },
    [scheduleSave]
  );

  const clearSlide = useCallback(
    async (slideNumber: number) => {
      setAnnotations((prev) => {
        const next = new Map(prev);
        next.set(slideNumber, { strokes: [], textNotes: [] });
        return next;
      });
      try {
        await deleteAnnotation(roomCode, slideNumber);
      } catch (e) {
        console.error("Failed to delete annotation", slideNumber, e);
      }
    },
    [roomCode]
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return {
    annotations,
    loadSlide,
    getSlideAnnotation,
    addStroke,
    addTextNote,
    undo,
    clearSlide,
  };
}
