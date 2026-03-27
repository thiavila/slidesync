"use client";

import Link from "next/link";
import { useTranslations } from "@/lib/i18n/use-translations";

export default function Home() {
  const { t } = useTranslations();
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white">
        <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 sm:py-32 text-center">
          {/* Logo */}
          <img
            src="/logo.png"
            alt="slidesync"
            className="mx-auto -mb-8 h-56 w-56 sm:-mb-12 sm:h-80 sm:w-80"
          />
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600 sm:text-xl">
            {t("home.subtitle")}
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/join"
              className="inline-flex items-center justify-center rounded-lg bg-brand px-8 py-4 text-lg font-medium text-white shadow-sm hover:bg-brand-dark transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
            >
              {t("home.joinButton")}
            </Link>
            <a
              href="#"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-8 py-4 text-lg font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
            >
              <svg
                className="mr-2 h-5 w-5 text-gray-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {t("home.installExtension")}
            </a>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-gray-50 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold text-gray-900 sm:text-4xl">
            {t("home.howItWorks")}
          </h2>

          <div className="mt-16 grid gap-12 sm:grid-cols-3 sm:gap-8">
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white text-xl font-bold">
                1
              </div>
              <div className="mt-6 flex h-12 w-12 items-center justify-center text-brand">
                <svg
                  className="h-10 w-10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                  <line x1="6" y1="1" x2="6" y2="4" />
                  <line x1="10" y1="1" x2="10" y2="4" />
                  <line x1="14" y1="1" x2="14" y2="4" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {t("home.step1Title")}
              </h3>
              <p className="mt-2 text-gray-600">
                {t("home.step1Desc")}
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white text-xl font-bold">
                2
              </div>
              <div className="mt-6 flex h-12 w-12 items-center justify-center text-brand">
                <svg
                  className="h-10 w-10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <polygon points="10 8 16 12 10 16 10 8" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {t("home.step2Title")}
              </h3>
              <p className="mt-2 text-gray-600">
                {t("home.step2Desc")}
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white text-xl font-bold">
                3
              </div>
              <div className="mt-6 flex h-12 w-12 items-center justify-center text-brand">
                <svg
                  className="h-10 w-10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12" y2="18.01" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {t("home.step3Title")}
              </h3>
              <p className="mt-2 text-gray-600">
                {t("home.step3Desc")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold text-gray-900 sm:text-4xl">
            {t("home.features")}
          </h2>

          <div className="mt-16 grid gap-8 sm:grid-cols-2">
            {/* Real-time sync */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-light text-brand">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {t("home.featureSync")}
              </h3>
              <p className="mt-2 text-gray-600">
                {t("home.featureSyncDesc")}
              </p>
            </div>

            {/* Annotations */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-light text-brand">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {t("home.featureAnnotations")}
              </h3>
              <p className="mt-2 text-gray-600">
                {t("home.featureAnnotationsDesc")}
              </p>
            </div>

            {/* PDF Export */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-light text-brand">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <polyline points="9 15 12 12 15 15" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {t("home.featureExport")}
              </h3>
              <p className="mt-2 text-gray-600">
                {t("home.featureExportDesc")}
              </p>
            </div>

            {/* No Login */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-light text-brand">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {t("home.featureNoLogin")}
              </h3>
              <p className="mt-2 text-gray-600">
                {t("home.featureNoLoginDesc")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex flex-col items-center gap-6 text-center">
            {/* Open source badge */}
            <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700">
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              {t("home.openSource")}
            </div>

            {/* Sponsor message */}
            <p className="text-sm text-gray-500 max-w-md">
              {t("home.sponsorMessage")}{" "}
              <a
                href="https://github.com/sponsors/thiavila"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand font-semibold hover:underline"
              >
                &#9829; {t("home.sponsorCta")}
              </a>
            </p>

            {/* Credits */}
            <p className="text-sm text-gray-500">
              {t("home.inspiredBy")}{" "}
              <a
                href="https://limhenry.xyz/slides/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand font-semibold hover:underline"
              >
                Remote for Slides
              </a>{" "}
              by Henry Lim.
            </p>

            {/* Footer links */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500 font-medium">
              <a
                href="https://github.com/thiavila/slide-sync"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-700 transition"
              >
                GitHub
              </a>
              <a
                href="https://github.com/sponsors/thiavila"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-700 transition"
              >
                {t("home.sponsorCta")}
              </a>
              <Link
                href="/privacy"
                className="hover:text-gray-700 transition"
              >
                {t("home.privacyPolicy")}
              </Link>
            </div>

            <p className="text-xs text-gray-400">
              MIT License
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
