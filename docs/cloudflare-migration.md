# Cloudflare Migration Plan

## Source
Originally documented in `README.md` lines 110-138.

## Current Setup (R$0/month)
- Web App: Vercel free tier (100GB bandwidth) — https://web-app-khaki-ten.vercel.app
- WebSocket: PartyKit free tier (20 rooms, 100 conn/room) — slide-sync.thiavila.partykit.dev

## Phase 1: Web App → Cloudflare Pages (R$0)

### Changes Required

**1. Enable static export** — `web-app/next.config.ts`
- Add `output: "export"` and `trailingSlash: true`

**2. Restructure the dynamic route** — the `/session/[roomCode]/` route
- Static export doesn't support dynamic routes (can't pre-render every possible room code)
- Replace `/session/[roomCode]/page.tsx` → `/session/page.tsx`
- Extract room code from `window.location.pathname` instead of `useParams()`
- URLs stay the same (`/session/ABC123`) — no Chrome extension changes needed

**3. Add Cloudflare `_redirects` file** — `web-app/public/_redirects`
- Map `/session/* → /session/index.html 200` (SPA-style routing)
- This tells Cloudflare Pages to serve the session page for any `/session/XYZ` path

**4. Deploy to Cloudflare Pages**
- Connect the GitHub repo to Cloudflare Pages dashboard
- Build command: `cd web-app && npm run build`
- Output directory: `web-app/out`
- Environment variable: `NEXT_PUBLIC_PARTYKIT_HOST=slide-sync.thiavila.partykit.dev`

### What stays the same
- PartyKit WebSocket server — no changes
- Chrome extension — no changes (URLs unchanged)
- All component code — no changes

### Files touched

| File | Action |
|------|--------|
| `web-app/next.config.ts` | Edit (add export + trailingSlash) |
| `web-app/src/app/session/page.tsx` | Create (replaces dynamic route) |
| `web-app/src/app/session/[roomCode]/page.tsx` | Delete |
| `web-app/public/_redirects` | Create |

### Cost: R$0
Cloudflare Pages free tier — unlimited bandwidth, 500 builds/month.

## Phase 2: WebSocket → Workers + Durable Objects (~$5/month)
- Only when PartyKit limits are hit (20 simultaneous rooms)
- Rewrite `party-server/server.ts` as a Durable Object
- Requires Workers Paid plan ($5/month minimum)

## Phase 3: Chrome Web Store ($5 one-time)
- Publish extension for easier distribution

## Cost Table
| Phase | Web App | WebSocket | Total |
|-------|---------|-----------|-------|
| Current | Vercel free | PartyKit free | R$0 |
| Phase 1 | CF Pages free | PartyKit free | R$0 |
| Phase 2 | CF Pages free | Workers + DO | ~$5/mo |
| Optional | Custom domain | — | ~$10/yr |

## Key Findings
- Next.js app has zero server-side deps (no API routes, server actions, middleware, database)
- PartyKit runs on Cloudflare under the hood — Phase 2 is conceptually straightforward
