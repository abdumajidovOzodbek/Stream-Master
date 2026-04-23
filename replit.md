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
