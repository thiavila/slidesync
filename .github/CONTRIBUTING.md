# Contributing to Slide Sync

Thanks for your interest in contributing! This project is a real-time slide synchronization tool for classrooms, and we welcome pull requests of all kinds.

## Project Structure

Slide Sync has three components:

| Component | Directory | Description |
|---|---|---|
| Chrome Extension | `chrome-extension/` | Captures slides from the presenter's browser |
| Web App | `web-app/` | Next.js app that displays slides to students |
| Party Server | `party-server/` | PartyKit WebSocket server that relays data |

## Setting Up the Dev Environment

### Prerequisites

- Node.js (v18+)
- npm
- A Chromium-based browser (Chrome, Edge, Brave, etc.)

### Web App

```bash
cd web-app
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

### Party Server

```bash
cd party-server
npx partykit dev
```

This starts the local PartyKit dev server.

### Chrome Extension

1. Open your browser and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the `chrome-extension/` directory.

## Making a Contribution

1. **Fork** the repository.
2. **Create a branch** for your change (`git checkout -b my-feature`).
3. **Make your changes** and test them locally.
4. **Commit** with a clear message describing what you did.
5. **Open a pull request** against `main`.

## Code Style

There is no specific linter configured. Just follow the patterns you see in the existing code and keep things consistent.

## Questions?

Open an issue and we will be happy to help.
