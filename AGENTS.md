# Repository Guide

## Shape

- The backend is one root Go module/package (`package main`). Normal startup opens PostgreSQL, applies embedded Goose migrations, starts stale-order cleanup, and serves Echo on `:8080`; `seed` is the only subcommand.
- `web/` is a separate Vite/React npm package. Use `npm --prefix web ...`; its entry path is `web/index.html` -> `web/src/main.tsx` -> `web/src/App.tsx`.
- Production is one Go process serving `/api/*` and the SPA from the relative path `web/dist`. Run locally built binaries from the repository root so assets resolve.

## Commands

- Required toolchain: Go 1.26, Node.js 24/npm, Docker, and Docker Compose. Install frontend dependencies with `npm --prefix web ci`.
- Start development with `APP_ORIGIN=http://localhost:5173 make dev`. Plain `make dev` currently defaults to `http://192.168.1.121:8080`, despite the README claim; browser mutations from Vite will fail exact-origin checks.
- Run the repository's complete verification in its defined order with `make check`: start PostgreSQL, run `go test ./...`, frontend typecheck, then frontend production build.
- Focus a DB-backed test with `make db-up` then `go test . -run '^TestName$'`. Tests create and drop isolated PostgreSQL schemas, so `TEST_DATABASE_URL` must allow both operations.
- A database-free focused check can run directly, for example `go test . -run '^TestNormalizeIranianMobile$'`.
- Build and run production-style with `make run`. No frontend test, lint, formatter, or codegen command is configured.

## Data And Migrations

- PostgreSQL is mandatory; `DATABASE_URL` defaults to Compose on `localhost:5433`. Opening the database, including during tests and `seed`, automatically applies migrations embedded from `migrations/*.sql`.
- Add forward-only migrations; production rollback keeps the previous app image, so schema changes must remain compatible with it. Do not replace schema work with GORM `AutoMigrate`.
- `SEED_ADMIN_LOGIN=admin SEED_ADMIN_PASSWORD='replace-me' make seed` idempotently creates or updates only the admin. `SEED_ADMIN_NAME` is optional; shops and products are not seeded.
- `DATA_DIR` defaults to `data`; receipts and product images live in its `receipts/` and `product-images/` directories. Treat both directories and PostgreSQL as one backup/restore set.

## Invariants

- State-changing routes require the request `Origin` to exactly equal `APP_ORIGIN`. Admin order/product data and receipt access must remain both authenticated and shop-scoped.
- Order creation retry safety spans both sides: the frontend retains `createKey` in session storage until success, and the backend checks its request fingerprint. Preserve both parts.
- Customer submission requires exactly one JPEG/PNG/WebP receipt and atomically moves `waiting_info` to `waiting_payment`. Public order responses keep customer data masked and omit internal notes/admin identity.
- The operational UI is Persian, RTL, mobile-first, and centered at about 480px; the public landing page intentionally uses a wider responsive layout.
- Executable code cancels `waiting_info` orders after 48 hours at startup and hourly. Product/planning documents that say seven days are stale.

## Release

- `make release` runs all checks, builds a Linux `amd64` image by default, and writes a tarball plus checksum under ignored `dist/`. Follow `DEPLOYMENT.md` for deployment, rollback, and coordinated database/upload backups.
