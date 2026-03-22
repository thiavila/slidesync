"use client";

import { useTranslations } from "@/lib/i18n/use-translations";

export default function PrivacyPage() {
  const { t } = useTranslations();

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <a href="/" className="text-sm text-blue-600 hover:underline">
            &larr; {t("session.backHome")}
          </a>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">
            {t("privacy.title")}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {t("privacy.lastUpdated")}
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-800">
            {t("privacy.dataCollection.title")}
          </h2>
          <p className="text-gray-600 leading-relaxed">
            {t("privacy.dataCollection.body")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-800">
            {t("privacy.dataTransmission.title")}
          </h2>
          <p className="text-gray-600 leading-relaxed">
            {t("privacy.dataTransmission.body")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-800">
            {t("privacy.dataStorage.title")}
          </h2>
          <p className="text-gray-600 leading-relaxed">
            {t("privacy.dataStorage.body")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-800">
            {t("privacy.thirdParty.title")}
          </h2>
          <p className="text-gray-600 leading-relaxed">
            {t("privacy.thirdParty.body")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-800">
            {t("privacy.permissions.title")}
          </h2>
          <p className="text-gray-600 leading-relaxed">
            {t("privacy.permissions.body")}
          </p>
          <ul className="list-disc list-inside text-gray-600 space-y-1 pl-2">
            <li><strong>activeTab</strong> &mdash; {t("privacy.permissions.activeTab")}</li>
            <li><strong>storage</strong> &mdash; {t("privacy.permissions.storage")}</li>
            <li><strong>tabs</strong> &mdash; {t("privacy.permissions.tabs")}</li>
            <li><strong>docs.google.com</strong> &mdash; {t("privacy.permissions.host")}</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-800">
            {t("privacy.openSource.title")}
          </h2>
          <p className="text-gray-600 leading-relaxed">
            {t("privacy.openSource.body")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-800">
            {t("privacy.contact.title")}
          </h2>
          <p className="text-gray-600 leading-relaxed">
            {t("privacy.contact.body")}
          </p>
        </section>
      </div>
    </main>
  );
}
