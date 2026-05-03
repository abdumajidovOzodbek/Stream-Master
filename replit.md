# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Replit Environment Setup (April 2026 import)

This project was imported from GitHub and configured to run in Replit:

- **Workflows**:
  - `Start application` (webview): runs the viewer (Vite) on `PORT=5000`, `BASE_PATH=/`. Vite proxies `/api` → `http://127.0.0.1:8000`.
  - `API Server` (console): runs the Express api-server on `PORT=8000`. Builds with esbuild then runs `dist/index.mjs`.
- **Vite dev server**: `host: "0.0.0.0"`, `allowedHosts: true`, and no-cache headers for Replit iframe proxy.
- **Required secrets** (configured via Replit Secrets):
  - `TELEGRAM_API_ID` — numeric, from https://my.telegram.org/apps
  - `TELEGRAM_API_HASH` — 32-char hex, from https://my.telegram.org/apps
  - `ADMIN_SECRET` — any string the site owner chooses; gates the `/admin` panel
- **Database**: `DATABASE_URL` is provided by Replit's managed PostgreSQL.

## Multi-User Session Architecture (May 2026)

Each browser visitor gets their own independent Telegram session. Sessions are isolated from one another.

### How it works

- On first visit the browser generates a UUID (`crypto.randomUUID()`) saved to `localStorage` as `tg_session_id`.
- Every API call sends an `X-Session-ID: <uuid>` header.
- The Express session middleware (`src/middlewares/session.ts`) reads this header, looks up or creates a `TelegramClient` for that session, and attaches it to `req.telegramClient`.
- Session strings (gramjs `StringSession`) are persisted in `artifacts/api-server/storage/sessions.json`, keyed by UUID.
- Each user must log in with their own Telegram account via the standard phone-code-password flow.

### Key files

- `artifacts/api-server/src/telegram/sessionStore.ts` — read/write `sessions.json`
- `artifacts/api-server/src/telegram/clientManager.ts` — per-session `TelegramClient` cache + login helpers
- `artifacts/api-server/src/middlewares/session.ts` — Express middleware
- `artifacts/api-server/src/server/auth.ts` — per-session auth routes
- `artifacts/api-server/src/server/admin.ts` — admin API (gated by `X-Admin-Secret` header)
- `artifacts/viewer/src/lib/session.ts` — UUID management + impersonation helpers
- `artifacts/viewer/src/lib/api.ts` — all fetch calls include `X-Session-ID`
- `artifacts/viewer/src/pages/AdminPage.tsx` — admin UI at `/admin`

### Admin panel (`/admin`)

- Accessible at the `/admin` URL on the viewer.
- Requires the `ADMIN_SECRET` env var to be set in Replit Secrets.
- Admin enters the secret in the browser; it is stored in `sessionStorage` (tab-only).
- Admin can see all logged-in sessions (name, phone, last-seen) and click "View as" to impersonate any user.
- Impersonation swaps `tg_session_id` in `localStorage` without modifying the target user's data.
- An amber banner in the main app shows "Viewing as another user" with a "Return" button.

## Telegram Viewer Features

### Media streaming
`GET /api/media/:chatId/:msgId` honors HTTP `Range` requests with 512 KB aligned chunks via `client.iterDownload`, so videos seek instantly. Photos and thumbs are still single-shot buffered.

### Messages
- Reply-to-message: `MessageEntry.replyTo` resolved in a single batch `getMessages` call.
- Read receipts: `DialogEntry.readOutboxMaxId` drives ✓ / ✓✓ per outgoing bubble.
- Mark-as-read on open: fires `POST /api/dialogs/:chatId/read` once per chat opened.
- Forwarded / edited indicators: `fwdFrom` and `editDate` fields on `MessageEntry`.
- Online / last seen: `DialogEntry.presence` from `Api.UserStatus*`.

### UI
- Photo lightbox (ESC or backdrop to close).
- Dark mode via `hooks/use-theme.ts`.
- Filter tabs in `ChatList`: All · Unread · Groups · Channels · Bots.
- Pinned chats section, total unread badge.
- Dialog polling: 15 s refetchInterval.
- Keyboard shortcuts: `Ctrl+K` search, `Ctrl+F` in-chat search, `Ctrl+L` stealth mode, `Ctrl+D` theme.
- Desktop notifications when unread count rises while tab is unfocused.
- Right-click context menu (Copy text, Reply, Copy link, Open in Telegram).
- Voice waveform: Web Audio API decodes audio, 48 SVG bars, play/pause with scrubbing.
- Emoji reactions: display + toggle + 8-emoji picker popover.
- File upload in Composer: paperclip button, preview, POSTs multipart to `/api/media`.
- User profile card: click any avatar → modal with name, username, bio, phone, online status.
- Shared media panel: Photos / Videos / Files tabs.
- In-chat message search: debounced via `/api/search`, click to scroll-and-highlight.
- Stealth mode: suppresses `markAsRead` calls so messages stay unread on Telegram's servers.
