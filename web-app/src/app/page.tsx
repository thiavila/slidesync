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

        <div className="space-y-4">
          <Link
            href="/join"
            className="block w-full py-4 px-6 bg-blue-600 text-white text-lg font-medium rounded-lg hover:bg-blue-700 transition"
          >
            Entrar na aula
          </Link>

          <Link
            href="/dashboard"
            className="block w-full py-4 px-6 bg-white text-gray-700 text-lg font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition"
          >
            Sou professor
          </Link>
        </div>
      </div>
    </main>
  );
}
