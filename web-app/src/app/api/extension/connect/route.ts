import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { roomCode } = await request.json();

  if (!roomCode) {
    return NextResponse.json({ error: "Missing room code" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, extension_secret, room_code, presentation_title, total_slides")
    .eq("room_code", roomCode)
    .eq("status", "active")
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({
    sessionId: session.id,
    extensionSecret: session.extension_secret,
    title: session.presentation_title,
    totalSlides: session.total_slides,
  });
}
