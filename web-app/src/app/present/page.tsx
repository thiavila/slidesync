"use client";

import { useEffect, useRef, useState } from "react";
import RevealFrame from "@/components/reveal-frame";
import { detectExtension } from "@/lib/reveal/extension-bridge";
import { useTranslations } from "@/lib/i18n/use-translations";

const STORAGE_KEY = "slidesync:reveal-html";
const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/slidesync-real-time-slide/eaiabbeapnegmnlomeijfkomdejgcjof";

type ExtState =
  | { status: "checking" }
  | { status: "available"; version?: string }
  | { status: "missing" };

function tryFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement) return;
  el.requestFullscreen?.().catch(() => {});
}

export default function PresentPage() {
  const { t } = useTranslations();
  const [html, setHtml] = useState<string | null>(null);
  const [ext, setExt] = useState<ExtState>({ status: "checking" });

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) setHtml(stored);
  }, []);

  useEffect(() => {
    let cancelled = false;
    detectExtension().then((res) => {
      if (cancelled) return;
      setExt(res.available
        ? { status: "available", version: res.version }
        : { status: "missing" });
    });
    return () => { cancelled = true; };
  }, []);

  // Extension's "Stop session" tells us to wipe and return to upload view.
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.source !== window) return;
      const data = e.data;
      if (
        data?.source === "slidesync-extension" &&
        data?.type === "session-ended"
      ) {
        sessionStorage.removeItem(STORAGE_KEY);
        if (document.fullscreenElement) document.exitFullscreen?.();
        setHtml(null);
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  if (ext.status === "checking") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">{t("present.checkingExtension")}</p>
      </main>
    );
  }

  if (ext.status === "missing") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-lg w-full text-center space-y-6">
          <h1 className="text-3xl font-bold text-gray-900">{t("present.extensionRequired")}</h1>
          <p className="text-gray-600">{t("present.extensionRequiredBody")}</p>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-brand px-6 py-3 text-white font-medium hover:bg-brand-dark transition"
          >
            {t("present.installExtension")}
          </a>
          <div>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {t("present.alreadyInstalled")}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!html) {
    return (
      <UploadView
        onReady={(uploadedHtml) => {
          sessionStorage.setItem(STORAGE_KEY, uploadedHtml);
          tryFullscreen();
          setHtml(uploadedHtml);
        }}
      />
    );
  }

  return (
    <main className="fixed inset-0 bg-black overflow-hidden">
      <RevealFrame html={html} className="absolute inset-0 w-full h-full border-0" />
    </main>
  );
}

function UploadView({ onReady }: { onReady: (html: string) => void }) {
  const { t } = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".html") && !name.endsWith(".htm")) {
        throw new Error(t("present.errorNotHtml"));
      }
      onReady(await file.text());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="max-w-lg w-full text-center space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t("present.title")}</h1>
          <p className="mt-2 text-gray-600">{t("present.subtitle")}</p>
        </div>

        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-8">
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="rounded-lg bg-brand px-6 py-3 text-white font-medium hover:bg-brand-dark transition disabled:opacity-50"
          >
            {loading ? t("present.loading") : t("present.chooseFile")}
          </button>
          <p className="mt-4 text-sm text-gray-500">{t("present.captureNote")}</p>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <a href="/" className="block text-sm text-gray-500 hover:text-gray-700">
          ← {t("session.backHome")}
        </a>
      </div>
    </main>
  );
}
