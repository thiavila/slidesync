"use client";

import { createContext, useState, useEffect, useCallback, ReactNode } from "react";
import ptBR from "./translations/pt-BR.json";
import en from "./translations/en.json";
import es from "./translations/es.json";
import fr from "./translations/fr.json";
import de from "./translations/de.json";
import ja from "./translations/ja.json";
import zhCN from "./translations/zh-CN.json";
import hi from "./translations/hi.json";

type Translations = Record<string, string>;

const translationMap: Record<string, Translations> = {
  "pt-BR": ptBR as Translations,
  "pt": ptBR as Translations,
  "en": en as Translations,
  "en-US": en as Translations,
  "en-GB": en as Translations,
  "es": es as Translations,
  "fr": fr as Translations,
  "de": de as Translations,
  "ja": ja as Translations,
  "zh-CN": zhCN as Translations,
  "zh": zhCN as Translations,
  "hi": hi as Translations,
};

function getLocale(): string {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language;
  if (translationMap[lang]) return lang;
  const base = lang.split("-")[0];
  if (translationMap[base]) return base;
  return "en";
}

interface I18nContextType {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
}

export const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState("en");

  useEffect(() => {
    setLocale(getLocale());
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const translations = translationMap[locale] || (en as Translations);
    const fallback = en as Translations;
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
