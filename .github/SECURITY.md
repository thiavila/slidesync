# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Slide Sync, please report it by:

1. **Opening a GitHub issue** with the `security` label, or
2. **Emailing directly** to the maintainer listed in the repository profile.

## What to Expect

- We will acknowledge your report within **48 hours**.
- We will provide a timeline for a fix and keep you updated on progress.

## Scope

This policy covers the following components:

- **Chrome Extension** — captures and sends slide images
- **Web App** — displays slides to students in real time
- **PartyKit Server** — relays data between the extension and the web app via WebSocket

## Architecture Note

Slide Sync is designed with a minimal attack surface:

- **No authentication** — there are no user accounts or credentials to compromise.
- **No database** — there is no persistent data store; all state is ephemeral and held in memory.
- **All data is ephemeral** — slide data exists only while a session is active and is discarded when the room closes.

This does not mean security issues are impossible, but it significantly limits the categories of vulnerabilities that apply.
