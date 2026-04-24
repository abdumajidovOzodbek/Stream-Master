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
