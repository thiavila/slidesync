import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  extractPresentationId,
  getPresentation,
  getSlideThumbnail,
} from "@/lib/google/slides-api";
import crypto from "crypto";

function generateRoomCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateExtensionSecret(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function POST(request: Request) {
  const supabase = await createClient();

  // Check auth
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url } = await request.json();
  const presentationId = extractPresentationId(url);
  if (!presentationId) {
    return NextResponse.json(
      { error: "Invalid Google Slides URL" },
      { status: 400 }
    );
  }

  const accessToken = session.provider_token;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Google access token not available. Please re-login." },
      { status: 401 }
    );
  }

  try {
    // Fetch presentation metadata
    const presentation = await getPresentation(presentationId, accessToken);

    // Generate room code (ensure unique)
    const serviceClient = createServiceClient();
    let roomCode = generateRoomCode();
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await serviceClient
        .from("sessions")
        .select("id")
        .eq("room_code", roomCode)
        .single();
      if (!existing) break;
      roomCode = generateRoomCode();
      attempts++;
    }

    const extensionSecret = generateExtensionSecret();

    // Create session
    const { data: sessionData, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        professor_id: session.user.id,
        room_code: roomCode,
        presentation_id: presentationId,
        presentation_title: presentation.title,
        total_slides: presentation.slides.length,
        current_slide: 1,
        extension_secret: extensionSecret,
        status: "active",
      })
      .select()
      .single();

    if (sessionError) {
      return NextResponse.json(
        { error: sessionError.message },
        { status: 500 }
      );
    }

    // Download and upload thumbnails to Supabase Storage
    for (const slide of presentation.slides) {
      try {
        const imageBuffer = await getSlideThumbnail(
          presentationId,
          slide.pageObjectId,
          accessToken
        );

        const filePath = `${sessionData.id}/slide-${slide.slideNumber}.png`;
        const { error: uploadError } = await serviceClient.storage
          .from("slide-thumbnails")
          .upload(filePath, imageBuffer, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          console.error(
            `Failed to upload slide ${slide.slideNumber}:`,
            uploadError
          );
          continue;
        }

        const {
          data: { publicUrl },
        } = serviceClient.storage
          .from("slide-thumbnails")
          .getPublicUrl(filePath);

        // Save slide image record
        await serviceClient.from("slide_images").insert({
          session_id: sessionData.id,
          slide_number: slide.slideNumber,
          page_object_id: slide.pageObjectId,
          thumbnail_url: publicUrl,
        });
      } catch (err) {
        console.error(`Failed to process slide ${slide.slideNumber}:`, err);
      }
    }

    return NextResponse.json(sessionData);
  } catch (err) {
    console.error("Session creation error:", err);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("professor_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(sessions);
}
