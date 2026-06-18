# THEHELIGROUP

Marketing site and AI chat agent for THEHELIGROUP — the UK's only combined Part 145 helicopter maintenance and Part 147 type-training organisation.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the server (builds then starts on PORT)
- `pnpm run typecheck` — full typecheck across all packages
- Required env: `ANTHROPIC_API_KEY` — powers the Claude chat agent

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Server: Express 5 (serves static frontend + `/api/chat` SSE endpoint)
- AI: Anthropic SDK (`@anthropic-ai/sdk`) with tool-use loop (max 6 turns)
- Calendar: luxon + date-holidays (mock Google Calendar slots)
- Build: esbuild (bundles to `dist/`, copies `public/` alongside)

## Where things live

- `artifacts/api-server/src/` — Express server source (TypeScript)
  - `routes/chat.ts` — POST `/api/chat` SSE streaming endpoint
  - `lib/businessContext.ts` — SYSTEM_PROMPT + business knowledge base
  - `lib/tools.ts` — Anthropic tool definitions + dispatcher
  - `lib/calendar.ts` — slot generation (mock busy pattern, UK business hours)
  - `lib/booking.ts` — AOG / lead-capture / calendar booking paths
- `artifacts/api-server/public/` — static frontend (index.html, styles.css, script.js, img/)
- `artifacts/api-server/dist/` — esbuild output (includes `public/` copy)

## Architecture decisions

- Express serves both the static frontend and `/api/*` from one process — no separate Vite app needed since the frontend is plain HTML/CSS/JS.
- The artifact routes all paths (`/`) so the proxy sends everything here.
- Chat uses SSE streaming so the UI shows tokens as they arrive.
- All integrations (Google Calendar, email, SMS/WhatsApp, lead storage) are mocked — swap out `lib/calendar.ts`, `lib/email.ts`, `lib/aog.ts`, `lib/leads.ts` to go live.
- `ANTHROPIC_API_KEY` is lazy-initialised — missing key gives a clear error at request time, not server startup, so the server still boots and serves the static page.

## Product

Landing page for THEHELIGROUP with: hero, about, two-pillar services (HELI145/HELI147), fleet grid (Leonardo + Airbus types), "why us" section, testimonial, trusted marquee, and contact. An embedded AI chat widget (bottom-right) qualifies visitors, books calendar meetings, and escalates AOG situations to the duty engineer.

## User preferences

_Populate as you build._

## Gotchas

- Express 5 requires `/{*path}` not `*` for wildcard catch-all routes.
- The `public/` directory must be copied into `dist/` at build time (done in `build.mjs`).
- In dev mode (`src/`), the public path is `../public`; in prod (`dist/`), it's `./public` — app.ts detects this via `__dirname`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
