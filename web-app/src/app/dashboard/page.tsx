"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { Session } from "@/types/database";

export default function DashboardPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ email?: string; name?: string } | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/api/auth/callback?next=/dashboard`,
            scopes: "https://www.googleapis.com/auth/presentations.readonly",
          },
        });
        if (error) {
          console.error("OAuth error:", error);
        }
        if (data?.url) {
          window.location.href = data.url;
        }
        return;
      }

      setUser({
        email: user.email,
        name: user.user_metadata?.full_name || user.email,
      });

      const res = await fetch("/api/sessions");
      if (res.ok) {
        setSessions(await res.json());
      }
      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Carregando...</p>
      </main>
    );
  }

  const activeSessions = sessions.filter((s) => s.status === "active");
  const pastSessions = sessions.filter((s) => s.status === "ended");

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Slide Sync</h1>
            <p className="text-sm text-gray-500">{user?.name}</p>
          </div>
          <Link
            href="/dashboard/create"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            Nova sessao
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {activeSessions.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Sessoes ativas
            </h2>
            <div className="space-y-3">
              {activeSessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/dashboard/session/${s.id}`}
                  className="block bg-white p-4 rounded-lg shadow-sm hover:shadow transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {s.presentation_title || "Sem titulo"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Codigo: {s.room_code} &middot; Slide {s.current_slide}/
                        {s.total_slides}
                      </p>
                    </div>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                      Ativa
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {pastSessions.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Sessoes anteriores
            </h2>
            <div className="space-y-3">
              {pastSessions.map((s) => (
                <div
                  key={s.id}
                  className="bg-white p-4 rounded-lg shadow-sm opacity-60"
                >
                  <p className="font-medium text-gray-900">
                    {s.presentation_title || "Sem titulo"}
                  </p>
                  <p className="text-sm text-gray-500">
                    Codigo: {s.room_code} &middot; {s.total_slides} slides
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {sessions.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>Nenhuma sessao ainda.</p>
            <p className="text-sm mt-1">
              Clique em &quot;Nova sessao&quot; para comecar.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
