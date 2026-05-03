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
- `pnpm --filter @workspace/api-server run login` — interactive Telegram MTProto login (prints a `TELEGRAM_SESSION` string to add as a secret)

## Telegram Channel Video Bridge

The API server logs into Telegram as a user via gramjs (MTProto), fetches videos from joined channels, downloads them locally to `artifacts/api-server/storage/`, and serves them as plain HTTP URLs.

- Secrets required: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`
- Endpoints: `GET /api/channel-videos?channel=<username>`, `GET /api/videos/{file}`
- Source layout: `src/auth/` (login CLI), `src/telegram/` (client + downloader), `src/server/` (Express routes), `storage/` (cached files)

See `artifacts/api-server/README.md` for full setup steps.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Replit Environment Setup (April 2026 import)

This project was imported from GitHub and configured to run in Replit:

- **Workflows**:
  - `Start application` (webview): runs the viewer (Vite) on `PORT=5000`, `BASE_PATH=/`. Vite proxies `/api` → `http://127.0.0.1:8000` so the frontend can call the backend during development.
  - `API Server` (console): runs the Express api-server on `PORT=8000`. It builds with esbuild then runs the bundled `dist/index.mjs`.
- **Vite dev server**: `host: "0.0.0.0"`, `allowedHosts: true`, and no-cache headers so the Replit iframe proxy works correctly.
- **Required secrets** (configured via Replit Secrets):
  - `TELEGRAM_API_ID` — numeric, from https://my.telegram.org/apps
  - `TELEGRAM_API_HASH` — 32-char hex, from https://my.telegram.org/apps
  - `TELEGRAM_SESSION` — saved gramjs StringSession (or empty/placeholder; users can log in via the web UI)
- **Database**: `DATABASE_URL` is provided by Replit's managed PostgreSQL.
- **Logging in**: if the saved session is invalid (`AUTH_KEY_UNREGISTERED`), use the web UI's Login screen to authenticate with phone + code, which creates a fresh session in `artifacts/api-server/storage/session.txt`.
- **Deployment**: `.replit` is preconfigured for autoscale via the artifact router; per-service production builds live in each `artifacts/*/.replit-artifact/artifact.toml`.

## Telegram Viewer Features (April 2026)

The viewer has been extended beyond a basic chat reader with native Telegram-like behaviors:

- **Media streaming**: `GET /api/media/:chatId/:msgId` honors HTTP `Range` requests with 512 KB aligned chunks via `client.iterDownload`, so videos seek instantly and large files don't pin server RAM. Photos and thumbs are still single-shot buffered. Implementation in `artifacts/api-server/src/lib/range.ts` + `openMessageMedia` in `telegram/chats.ts`.
- **Reply-to-message**: `MessageEntry.replyTo` includes the resolved preview (sender + text + hasMedia). `listMessages` batches a single follow-up `getMessages` call to fetch all reply targets in one round-trip. Frontend: hover-reveal reply button on each bubble, preview pill in `Composer`, click-to-jump on the inline quoted bubble (with a 1.5s flash highlight).
- **Read receipts**: `DialogEntry.readOutboxMaxId` drives a single ✓ or double ✓✓ check on every outgoing message bubble in `MessageView`.
- **Mark-as-read on open**: `POST /api/dialogs/:chatId/read` calls gramjs `markAsRead`; the viewer fires it once per chat opened when there are unread messages.
- **Forwarded / edited indicators**: `MessageEntry.fwdFrom` and `MessageEntry.editDate` render an italic "Forwarded from X" header and a small ✏ "edited" tag in the bubble footer.
- **Online / last seen**: `DialogEntry.presence` (mapped from `Api.UserStatus*`) drives a green dot on user avatars in the chat list and a subtitle like "online" / "last seen at 14:32" in the chat header.
- **Photo lightbox**: clicking any loaded photo opens a fullscreen overlay (`components/PhotoLightbox.tsx`); ESC or backdrop closes.
- **Dark mode**: `hooks/use-theme.ts` persists the choice in `localStorage` and toggles the `.dark` class on `<html>`. A sun/moon button lives in the sidebar header next to the logout button.

## 15-Feature Upgrade (May 2026)

All 15 improvements implemented across backend and frontend:

### Backend additions (`telegram/chats.ts`, `server/chats.ts`)
- `GET /api/search?chatId=X&q=Y&limit=N` — full-text message search via gramjs `getMessages({ search })`.
- `GET /api/users/:peerId` — peer info including bio via `GetFullUser` / `GetFullChannel` invoke.
- `POST /api/media` (multipart/form-data, multer memoryStorage 50 MB) — sends file with optional caption + replyToMsgId using gramjs `CustomFile`.
- `POST /api/reactions/:chatId/:msgId` — toggle emoji reaction via `Api.messages.SendReaction`.
- `MessageEntry.reactions: Reaction[]` — extracted from `Api.MessageReactions` on every fetched message.

### Frontend additions
- **Filter tabs** (`ChatList.tsx`): All · Unread · Groups · Channels · Bots with per-tab unread counts.
- **Pinned chats section**: separated "Pinned" header above regular chats when pinned chats exist.
- **Total unread badge** in sidebar header (sum of all dialog unread counts).
- **Dialog polling**: 15 s `refetchInterval` on dialogs; 8 s on active chat messages.
- **Keyboard shortcuts**: `Ctrl+K` focuses chat search; `Ctrl+F` toggles in-chat search panel; `Escape` clears reply / closes panels.
- **Desktop notifications** (`hooks/use-notifications.ts`): tracks unread counts across renders, fires `Notification` when count rises while tab is unfocused; click navigates to that chat.
- **Right-click context menu** (`MessageContextMenu.tsx`): Copy text, Reply, Copy link, Open in Telegram — built on Radix `ContextMenu`.
- **Voice waveform** in `MessageView.tsx`: Web Audio API decodes audio buffer, samples 48 bars, SVG rendering, play/pause with scrubbing via click.
- **Emoji reactions** (`ReactionChips`): displays per-message reaction counts, click to toggle; 8-emoji picker popover.
- **File upload in Composer** (`Composer.tsx`): paperclip button, image/file preview, POSTs multipart to `/api/media`.
- **User profile card** (`UserProfileCard.tsx`): click any avatar → modal with name, username, bio, phone, online status.
- **Shared media panel** (`SharedMediaPanel.tsx`): side panel with Photos/Videos/Files tabs; reuses the existing messages infinite-query cache.
- **In-chat message search** (`SearchPanel` in `MessageView.tsx`): debounced search via `/api/search`, results listed below header, click to scroll-and-highlight.
