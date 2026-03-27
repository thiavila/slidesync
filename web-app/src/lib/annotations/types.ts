export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  tool: "pen" | "eraser";
  points: Point[];
  color: string;
  lineWidth: number;
  timestamp: number;
}

export interface TextNote {
  id: string;
  position: Point;
  text: string;
  color: string;
  fontSize: number;
  timestamp: number;
}

export interface SlideAnnotation {
  strokes: Stroke[];
  textNotes: TextNote[];
}
