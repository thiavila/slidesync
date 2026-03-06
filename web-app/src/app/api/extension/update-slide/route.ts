import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { sessionId, currentSlide, extensionSecret } = await request.json();

  if (!sessionId || !currentSlide || !extensionSecret) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Verify extension secret
  const { data: session } = await supabase
    .from("sessions")
    .select("id, extension_secret, status")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.extension_secret !== extensionSecret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
  }

  if (session.status !== "active") {
    return NextResponse.json({ error: "Session ended" }, { status: 400 });
  }

  // Update current slide
  const { error } = await supabase
    .from("sessions")
    .update({ current_slide: currentSlide })
    .eq("id", session.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
