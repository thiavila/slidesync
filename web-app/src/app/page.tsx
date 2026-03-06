"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Slide Sync</h1>
          <p className="mt-2 text-gray-600">
            Acompanhe os slides da aula em tempo real
          </p>
        </div>

        <Link
          href="/join"
          className="block w-full py-4 px-6 bg-blue-600 text-white text-lg font-medium rounded-lg hover:bg-blue-700 transition"
        >
          Entrar na aula
        </Link>

        <p className="text-xs text-gray-400">
          Professor? Instale a extensao do Chrome para comecar.
        </p>

        <p className="text-xs text-gray-400 pt-4">
          Inspired by{" "}
          <a href="https://limhenry.xyz/slides/" target="_blank" className="text-blue-400 hover:underline">
            Remote for Slides
          </a>{" "}
          by Henry Lim.{" "}
          <a href="https://www.patreon.com/remoteforslides" target="_blank" className="text-blue-400 hover:underline">
            Support him, not me.
          </a>
        </p>
      </div>
    </main>
  );
}
