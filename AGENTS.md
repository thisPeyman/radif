# Repository Guide

## Layout

- The backend is one root Go module/package (`package main`); `main.go` applies embedded Goose migrations, handles the admin-only `seed` subcommand, and starts Echo on `:8080`.
- `web/` is a separate npm package. Run npm commands with `npm --prefix web`; the frontend entry path is `web/index.html` -> `web/src/main.tsx` -> `web/src/App.tsx`.
- Production is one Go process serving `/api/*` and SPA files from the relative path `web/dist`. Run the binary from the repository root.

## Commands

- Toolchain: Go 1.26, Node.js 24, npm, Docker, and Docker Compose.
- Install locked frontend dependencies without changing them: `npm --prefix web ci`.
- Start local development: `make dev`. The Makefile defaults `APP_ORIGIN` to `http://localhost:5173`; protected mutations require that exact origin while Vite is running there.
- Seed/update the admin account: `SEED_ADMIN_LOGIN=admin SEED_ADMIN_PASSWORD='replace-me' make seed`. `SEED_ADMIN_NAME` is optional; shops and products are not seeded.
- Run all checks in repository order: `make check` (`go test ./...`, frontend typecheck, then frontend production build).
- Focus a Go test after `make db-up`: `go test ./... -run '^TestName$'`. Tests use isolated temporary PostgreSQL schemas; override their connection with `TEST_DATABASE_URL`.
- Build and run production-style: `make run`. There are no configured frontend test, lint, formatter, or codegen commands.

## Data And Configuration

- `DATABASE_URL` selects PostgreSQL and defaults to the Compose service exposed at `localhost:5433`. `DATA_DIR` defaults to `data` and stores receipts at `$DATA_DIR/receipts`.
- Runtime variables are `DATABASE_URL`, `APP_ORIGIN`, `SESSION_LIFETIME` (positive Go duration, default `720h`), `COOKIE_SECURE` (set `true` behind HTTPS), and `MAX_RECEIPT_BYTES` (positive bytes, default 5 MiB).
- Treat PostgreSQL backups and the receipt directory as one operational data set.

## Constraints To Preserve

- The UI is Persian, RTL, mobile-first, and intentionally constrained to a roughly 480px content width.
- Order creation uses `createKey` idempotency: the frontend keeps the key in session storage until success and the backend validates the request fingerprint. Preserve this retry protection.
- Customer details and exactly one JPEG/PNG/WebP receipt are committed atomically; success moves `waiting_info` to `waiting_payment`, not directly to `paid`.
- Public order responses must keep customer data masked and omit internal notes/admin identity. Admin order and receipt access remains shop-owner scoped.
- Startup and an hourly job cancel `waiting_info` orders at least seven days old and record status history.
