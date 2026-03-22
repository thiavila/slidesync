"use client";

import { createContext, useState, useEffect, useCallback, ReactNode } from "react";
import ptBR from "./translations/pt-BR.json";
import en from "./translations/en.json";

type Translations = Record<string, string>;

const translationMap: Record<string, Translations> = {
  "pt-BR": ptBR as Translations,
  "pt": ptBR as Translations,
  "en": en as Translations,
  "en-US": en as Translations,
  "en-GB": en as Translations,
};

function getLocale(): string {
  if (typeof navigator === "undefined") return "pt-BR";
  const lang = navigator.language;
  if (translationMap[lang]) return lang;
  const base = lang.split("-")[0];
  if (translationMap[base]) return base;
  return "pt-BR";
}

interface I18nContextType {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
}

export const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState("pt-BR");

  useEffect(() => {
    setLocale(getLocale());
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const translations = translationMap[locale] || (ptBR as Translations);
    const fallback = ptBR as Translations;
    let text = translations[key] || fallback[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{{${k}}}`, String(v));
      });
    }
    return text;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ t, locale }}>
      {children}
    </I18nContext.Provider>
  );
}
