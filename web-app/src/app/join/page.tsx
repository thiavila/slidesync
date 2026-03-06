"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RoomCodeInput from "@/components/room-code-input";
import Link from "next/link";

export default function JoinPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(code: string) {
    setLoading(true);
    setError(null);
    router.push(`/session/${code}`);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entrar na aula</h1>
          <p className="mt-2 text-gray-600">
            Digite o codigo de 6 digitos fornecido pelo professor
          </p>
        </div>

        <RoomCodeInput onSubmit={handleSubmit} loading={loading} error={error} />

        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          Voltar
        </Link>
      </div>
    </main>
  );
}
