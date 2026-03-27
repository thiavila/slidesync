"use client";

import { useContext } from "react";
import { I18nContext } from "./i18n-provider";

export function useTranslations() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslations must be used within I18nProvider");
  }
  return context;
}
