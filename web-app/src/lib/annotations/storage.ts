import { createStore, get, set, del, keys } from "idb-keyval";
import type { SlideAnnotation } from "./types";

const store = createStore("slide-sync-annotations", "annotations");

function makeKey(roomCode: string, slideNumber: number): string {
  return `${roomCode}-slide-${slideNumber}`;
}

export async function getAnnotation(
  roomCode: string,
  slideNumber: number
): Promise<SlideAnnotation | undefined> {
  return get<SlideAnnotation>(makeKey(roomCode, slideNumber), store);
}

export async function setAnnotation(
  roomCode: string,
  slideNumber: number,
  annotation: SlideAnnotation
): Promise<void> {
  await set(makeKey(roomCode, slideNumber), annotation, store);
}

export async function deleteAnnotation(
  roomCode: string,
  slideNumber: number
): Promise<void> {
  await del(makeKey(roomCode, slideNumber), store);
}

export async function getAllSlideNumbers(roomCode: string): Promise<number[]> {
  const allKeys = await keys(store);
  const prefix = `${roomCode}-slide-`;
  return (allKeys as string[])
    .filter((k) => k.startsWith(prefix))
    .map((k) => parseInt(k.slice(prefix.length)))
    .sort((a, b) => a - b);
}
