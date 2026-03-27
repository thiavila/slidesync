import type * as Party from "partykit/server";

interface SlideData {
  slideNumber: number;
  imageData: string; // base64 PNG
}

interface RoomState {
  slides: Map<number, string>; // slideNumber -> base64 image
  currentSlide: number;
  totalSlides: number;
}

export default class SlideServer implements Party.Server {
  state: RoomState = {
    slides: new Map(),
    currentSlide: 1,
    totalSlides: 0,
  };

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    // Send current state to new connection
    const slides: Record<number, string> = {};
    this.state.slides.forEach((img, num) => {
      slides[num] = img;
    });

    conn.send(
      JSON.stringify({
        type: "init",
        currentSlide: this.state.currentSlide,
        slides,
      })
    );
  }

  onMessage(message: string, sender: Party.Connection) {
    const data = JSON.parse(message);

    if (data.type === "slide-update") {
      const { slideNumber, imageData } = data as {
        type: string;
        slideNumber: number;
        imageData: string;
      };

      // Update the slide image (replaces if same slide = animation update)
      this.state.slides.set(slideNumber, imageData);
      this.state.currentSlide = slideNumber;
      if (slideNumber > this.state.totalSlides) {
        this.state.totalSlides = slideNumber;
      }

      // Broadcast to all OTHER connections (students)
      this.room.broadcast(
        JSON.stringify({
          type: "slide-update",
          slideNumber,
          imageData,
          currentSlide: this.state.currentSlide,
        }),
        [sender.id]
      );
    }
  }
}
