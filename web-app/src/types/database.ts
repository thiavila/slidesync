export interface Professor {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  professor_id: string;
  room_code: string;
  presentation_id: string;
  presentation_title: string | null;
  total_slides: number;
  current_slide: number;
  status: "active" | "ended";
  extension_secret: string;
  created_at: string;
  ended_at: string | null;
}

export interface SlideImage {
  id: string;
  session_id: string;
  slide_number: number;
  page_object_id: string;
  thumbnail_url: string;
}
