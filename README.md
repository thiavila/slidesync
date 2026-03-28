# slidesync

Real-time slide sharing. Present on Google Slides; your audience follows along on their own devices.

**[slidesync.live](https://slidesync.live)** — free to use, no account needed.

## Overview

slidesync lets a presenter broadcast their Google Slides presentation to every viewer in the room, in real-time. Viewers see slides update instantly on their phones, tablets, or laptops -- no login required. They can annotate slides and export them as PDF for later review.

Inspired by [Remote for Slides](https://limhenry.xyz/slides/) by [Henry Lim](https://limhenry.xyz/).

## Architecture

```
Chrome Extension              PartyKit Server              Web App (Next.js)
(Google Slides)                (WebSocket relay)            (Viewer)
      |                              |                            |
      |--- screenshot (base64) ----->|                            |
      |                              |--- broadcast ------------>|
      |                              |    (slide-update)          |--- render slides
      |                              |                            |    1..currentSlide
```

Three components, zero database -- all state is ephemeral and lives in memory.

| Component | Purpose | Tech |
|---|---|---|
| **Chrome Extension** | Captures screenshots on each slide change, sends via WebSocket | Manifest V3 |
| **PartyKit Server** | Relays screenshots between presenter and viewers | PartyKit (Cloudflare Workers) |
| **Web App** | Viewers watch and annotate slides in real-time | Next.js, Tailwind CSS |

## Features

- **Real-time sync** -- slides update on every device the moment the presenter advances
- **Screenshot-based** -- captures actual screen content, so animations and step-by-step builds just work
- **Annotations** -- viewers can draw, highlight, and write notes on any slide
- **PDF export** -- download slides with personal annotations for later review
- **No login required** -- viewers just enter a 6-digit room code or scan a QR code
- **i18n** -- supports English and Brazilian Portuguese, auto-detected from browser

## Getting Started (for users)

1. Install the slidesync Chrome extension
2. Open a presentation in Google Slides
3. Click **"Present w/ slidesync"** in the toolbar
4. Share the room code or QR code with your audience
5. Viewers open the web app, enter the code, and follow along

## Development Setup

### Prerequisites

- Node.js 18+
- npm

### Run all three components locally

```bash
# 1. Start PartyKit server
cd party-server
npx partykit dev
# Running on http://localhost:1999

# 2. Start web app
cd web-app
npm install
npm run dev
# Running on http://localhost:3000

# 3. Load Chrome Extension
# Go to chrome://extensions
# Enable "Developer mode"
# Click "Load unpacked" -> select the chrome-extension/ folder

# 4. Open Google Slides -> Present w/ slidesync -> start a session
```

### Environment variables

The web app needs one variable:

```
NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999
```

## Deployment

- **Web App**: Vercel (or any static host / Cloudflare Pages)
- **WebSocket Server**: PartyKit free tier (20 rooms, 100 connections/room)
- **Chrome Extension**: local install (Chrome Web Store planned)

## Tech Stack

- **Chrome Extension** -- Manifest V3, content scripts, `chrome.tabCapture`
- **WebSocket Server** -- [PartyKit](https://partykit.io/) by Sunil Pai
- **Web App** -- Next.js 14, React, Tailwind CSS, partysocket
- **QR Codes** -- [qrcodejs](https://github.com/davidshimjs/qrcodejs)

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)

## Credits

- **[Henry Lim](https://limhenry.xyz/)** -- Creator of [Remote for Slides](https://limhenry.xyz/slides/). The UI patterns, toolbar injection technique, and slide detection method were learned from studying his extension. [Support him on Patreon](https://www.patreon.com/remoteforslides).
- **[PartyKit](https://partykit.io/)** -- Free WebSocket infrastructure by Sunil Pai.
- **[qrcodejs](https://github.com/davidshimjs/qrcodejs)** -- QR code generation library.
