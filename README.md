# Slide Sync

Real-time slide synchronization for classrooms. The professor presents on Google Slides and students follow along on their devices, seeing only the slides up to the current one — never ahead.

Built by a professor, for professors.

**Inspired by [Remote for Slides](https://limhenry.xyz/slides/) by [Henry Lim](https://limhenry.xyz/).** This project wouldn't exist without his work. [Support him on Patreon](https://www.patreon.com/remoteforslides) — he deserves it.

## How It Works

1. Professor opens Google Slides and clicks **"Present w/ Slide Sync"**
2. A side drawer appears with a **room code** and **QR code**
3. Students scan the QR code or enter the room code at the web app
4. As the professor advances slides, students see updates in real-time
5. Students **cannot** see future slides — only slides up to the current one
6. Each click is captured as a screenshot, so **animations work** (bullet points appearing one by one)

## Architecture

```
Chrome Extension          PartyKit Server          Web App (Next.js)
(Google Slides)           (WebSocket relay)        (Student view)
     |                         |                        |
     |-- screenshot --------->|                        |
     |   (base64 JPEG)        |-- broadcast ---------->|
     |                         |   (slide-update)       |-- render slides
     |                         |                        |   1..currentSlide
```

Three components, zero database:

| Component | What it does | Tech |
|-----------|-------------|------|
| **Chrome Extension** | Captures screenshots on slide change, sends via WebSocket | Manifest V3, content script |
| **PartyKit Server** | Relays screenshots between professor and students | PartyKit (Cloudflare Workers) |
| **Web App** | Students view slides in real-time | Next.js, partysocket |

## Project Structure

```
slide-sync/
  chrome-extension/       # Chrome Extension (Manifest V3)
    manifest.json
    content/              # Injected into Google Slides
      content.js          # Edit mode: toolbar button | Present mode: drawer + capture
      content.css         # Drawer styles (inspired by Remote for Slides)
      qrcode.min.js       # QR code generation (qrcodejs)
    background/
      background.js       # WebSocket connection + captureVisibleTab
    popup/                # Extension popup (session status)

  party-server/           # PartyKit WebSocket server
    server.ts             # Relay: receives screenshots, broadcasts to students
    partykit.json

  web-app/                # Next.js web app (student view)
    src/app/
      page.tsx            # Landing page
      join/page.tsx       # Room code input
      session/[roomCode]/ # Real-time slide viewer
    src/components/
      slide-viewer.tsx    # Renders slides 1..currentSlide
      room-code-input.tsx # 6-digit code input
```

## Running Locally

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
# Click "Load unpacked" → select the chrome-extension/ folder

# 4. Open Google Slides → click "Present w/ Slide Sync" → start session
```

## Production Deployment

Currently deployed at:
- **Web App**: https://web-app-khaki-ten.vercel.app (Vercel free tier)
- **PartyKit**: slide-sync.thiavila.partykit.dev (PartyKit free tier)

### Free Tier Limits
- **PartyKit**: 20 simultaneous rooms, 100 connections/room
- **Vercel**: 100GB bandwidth/month

This is enough for personal/university use (20 professors presenting at the same time).

## Future: Migration to Cloudflare (for global scale)

When scaling beyond free tier limits, the plan is to migrate everything to Cloudflare:

### Why Cloudflare
- **Cloudflare Pages** (web app): free, unlimited bandwidth, global CDN
- **Cloudflare Workers + Durable Objects** (WebSocket): ~$5/month, massive scale
- Total cost: **~$5/month** to serve thousands of professors worldwide

### Migration Steps
1. **Web App** → Cloudflare Pages
   - Use `@cloudflare/next-on-pages` adapter, or simplify to static HTML/JS (the app is simple enough)
   - `wrangler pages deploy` instead of `vercel deploy`

2. **WebSocket Server** → Cloudflare Workers + Durable Objects
   - Rewrite `party-server/server.ts` as a Durable Object (same logic, different API)
   - Each room = one Durable Object instance (same concept as PartyKit rooms)
   - PartyKit actually runs on Cloudflare under the hood, so the migration is straightforward

3. **Chrome Extension** → Chrome Web Store ($5 one-time fee)

### Estimated Cost at Scale
| Service | Cost |
|---------|------|
| Cloudflare Pages | $0 |
| Cloudflare Workers + Durable Objects | ~$5/month |
| Chrome Web Store | $5 one-time |
| Custom domain (optional) | ~$10/year |
| **Total** | **~$5/month** |

## Future: Remote for Slides Features

The goal is to also include the remote control features that Remote for Slides provides:

- [ ] **Remote slide control** — control slides from a phone/tablet (next/previous)
- [ ] **Speaker notes** — view speaker notes on the remote device
- [ ] **Timer** — presentation timer on the remote device
- [ ] **Pointer/laser** — virtual laser pointer from the remote device
- [ ] **Dark mode** — for the student view and remote control

These features would make Slide Sync a complete replacement: real-time slide sharing for students + remote control for the professor, all in one extension.

## Credits

- **[Henry Lim](https://limhenry.xyz/)** — Creator of [Remote for Slides](https://limhenry.xyz/slides/). The UI patterns, toolbar injection technique, and slide detection method used in this project were learned from studying his extension. [Support him on Patreon](https://www.patreon.com/remoteforslides).
- **[PartyKit](https://partykit.io/)** — Free WebSocket infrastructure by Sunil Pai.
- **[qrcodejs](https://github.com/davidshimjs/qrcodejs)** — QR code generation library.

## License

MIT
