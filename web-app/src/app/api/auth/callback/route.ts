import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Ensure professor record exists
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.from("professors").upsert(
          {
            id: user.id,
            email: user.email!,
            display_name:
              user.user_metadata?.full_name || user.user_metadata?.name || null,
          },
          { onConflict: "id" }
        );
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error - redirect to home
  return NextResponse.redirect(`${origin}/?error=auth`);
}
