const SLIDES_API_BASE = "https://slides.googleapis.com/v1/presentations";

export interface SlideMetadata {
  pageObjectId: string;
  slideNumber: number;
}

export interface PresentationData {
  presentationId: string;
  title: string;
  slides: SlideMetadata[];
}

export async function getPresentation(
  presentationId: string,
  accessToken: string
): Promise<PresentationData> {
  const res = await fetch(`${SLIDES_API_BASE}/${presentationId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch presentation: ${error}`);
  }

  const data = await res.json();

  const slides: SlideMetadata[] = data.slides.map(
    (slide: { objectId: string }, index: number) => ({
      pageObjectId: slide.objectId,
      slideNumber: index + 1,
    })
  );

  return {
    presentationId: data.presentationId,
    title: data.title,
    slides,
  };
}

export async function getSlideThumbnail(
  presentationId: string,
  pageObjectId: string,
  accessToken: string
): Promise<Buffer> {
  // Get thumbnail URL from Google Slides API
  const res = await fetch(
    `${SLIDES_API_BASE}/${presentationId}/pages/${pageObjectId}/thumbnail?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=LARGE`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch thumbnail: ${error}`);
  }

  const data = await res.json();
  const thumbnailUrl = data.contentUrl;

  // Download the actual image
  const imageRes = await fetch(thumbnailUrl);
  if (!imageRes.ok) {
    throw new Error("Failed to download thumbnail image");
  }

  const arrayBuffer = await imageRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function extractPresentationId(url: string): string | null {
  // Matches URLs like:
  // https://docs.google.com/presentation/d/PRESENTATION_ID/edit
  // https://docs.google.com/presentation/d/PRESENTATION_ID/present
  const match = url.match(
    /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/
  );
  return match ? match[1] : null;
}
