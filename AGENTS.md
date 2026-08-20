# Agent Quickstart

## Read Policy

- Start here. Read `CODEMAP.md` only for unfamiliar or cross-cutting work, then inspect the relevant source and its test. Do not preload every document.
- Implementation truth is code and tests; schema truth is `migrations/*.sql`; command truth is `Makefile`; product intent is `PRODUCT.md`; production procedure is `DEPLOYMENT.md`.
- `MVP_PLAN.md` and `instagram_order_mvp_product_document_en.md` are historical and non-authoritative.

## Shape

- The backend is one root Go module/package (`package main`). `main.go:run` opens PostgreSQL, applies embedded Goose migrations, starts stale-order cleanup, and serves Echo on `:8080`; `seed` is the only subcommand.
- `main.go:newServer` is the API route index. Handlers receive `*gorm.DB` directly; there is no repository/service layer.
- `web/` is a separate Vite/React package. Entry: `web/index.html` -> `web/src/main.tsx` -> `web/src/App.tsx` -> `web/src/AdminApp.tsx` for authenticated routes.
- For frontend work, use the `frontend-design` skill.
- Production is one Go process serving `/api/*` and the SPA from relative `web/dist`; run local binaries from the repository root.

## Feature Lookup

| Area | Backend | Frontend | Primary test |
| --- | --- | --- | --- |
| Startup, routes, config, DB | `main.go`, `config.go`, `database.go` | `App.tsx`, `AdminApp.tsx`, `shared.ts` | `main_test.go`, `database_test.go` |
| Login, sessions, trials, shop access/support | `auth.go`, `password_auth.go`, `signup.go`, `subscriptions.go` | `LoginPage.tsx`, `AccountPage.tsx`, `AdminApp.tsx` | `auth_test.go` |
| Products and images | `products.go`, `images.go` | `ProductsPage.tsx`, `ProductFormPage.tsx`, `components.tsx` | `products_test.go` |
| Order create/list/admin/public | `orders.go` | `CreateOrderPage.tsx`, `OrdersPage.tsx`, `AdminOrderPage.tsx`, `PublicOrderPage.tsx` | `orders_test.go` |
| Historical import | `historical_orders.go` | `HistoricalOrderPage.tsx` | `historical_orders_test.go` |
| Customer details and first receipt | `customer.go`, `images.go` | `PublicOrderPage.tsx`, `components.tsx` | `customer_test.go` |
| Split/final payment | `installment_payments.go` | `AdminOrderPage.tsx`, `PublicOrderPage.tsx` | `installment_payments_test.go` |
| Payment cards and IBAN | `payment_cards.go` | `AccountPage.tsx`, `PublicOrderPage.tsx` | `auth_test.go` |
| Shop report | `reports.go` | `ReportPage.tsx` | `reports_test.go` |
| Pilot events | `pilot_events.go` and callers | `shared.ts` and page callers | `pilot_events_test.go` |
| Delivery dates | `orders.go`, `historical_orders.go` | `DeliveryDateSelect.tsx`, `shared.ts` | relevant order tests |
| Data model | `models.go`, `migrations/*.sql` | domain types in `shared.ts` | `database_test.go` |

Page components above are under `web/src/pages/`; shared frontend files are under `web/src/`. Use `CODEMAP.md` for flows, symbols, migrations, storage, and focused navigation anchors.

## Explore Efficiently

1. Locate the feature in the table and inspect its production file plus primary test.
2. For HTTP work, confirm middleware/order in `main.go:newServer`; for UI routing, inspect `App.tsx` and `AdminApp.tsx`.
3. Grep the handler, type, storage key, or status before editing to find all callers and coupled paths.
4. Read only migrations touching the relevant columns; migrations, not GORM tags, own the schema.
5. Run the narrowest relevant test first, then `make check` before finishing code changes.

## Commands

- Required: Go 1.26, Node.js 24/npm, Docker, Docker Compose. Install frontend dependencies with `npm --prefix web ci`.
- Local Vite development: `APP_ORIGIN=http://localhost:5173 make dev`. Plain `make dev` currently defaults to `http://192.168.1.121:8080`, which fails exact-origin checks from localhost Vite. Use `DEV_OTP_CODE=123456` to exercise the OTP flow without SMS delivery.
- Full verification: `make check` starts PostgreSQL, runs `go test ./...`, frontend typecheck, then frontend build.
- Focused DB test: `make db-up`, then `go test . -run '^TestName$'`. Tests create/drop isolated PostgreSQL schemas; `TEST_DATABASE_URL` needs both permissions.
- Database-free example: `go test . -run '^TestNormalizeIranianMobile$'`.
- Production-style local run: `make run`. Release artifact: `make release`.
- No frontend test, lint, formatter, or codegen command is configured.

## Hard Invariants

- State-changing routes require request `Origin` to exactly equal `APP_ORIGIN`.
- Admin order/product data and both receipt types must remain authenticated and shop-scoped. Public product images are intentional.
- Order retry safety spans frontend session-storage `createKey` retention and backend request fingerprints. Preserve both normal and historical paths.
- Customer submission requires exactly one JPEG/PNG/WebP receipt and atomically changes `waiting_info` to `waiting_payment`; upload never means `paid`.
- Public order responses keep customer data masked and omit receipts, internal notes, conversation references, unit prices, and admin identity.
- Payment settings are snapshotted onto orders; final-payment requests take a second snapshot. Product prices are snapshotted, but product names/images remain live.
- Expired shops retain private reads and public customer links, but every private mutation must pass the shared active-subscription guard.
- `waiting_info` orders are cancelled 72 hours after creation at startup and hourly. Cleanup uses creation time, not time entering the status.
- PostgreSQL, `DATA_DIR/receipts`, and `DATA_DIR/product-images` are one backup/restore set.
- The operational UI is Persian, RTL, mobile-first, and centered near 480px; the landing page intentionally uses a wider responsive layout.
- `IRANIAN_HOLIDAYS` in `web/src/shared.ts` is year-specific and must be updated when supporting a new Jalali year.

## Schema And Operations

- PostgreSQL is mandatory. `DATABASE_URL` defaults to Compose on `localhost:5433`; opening the DB during server, tests, or seed automatically applies embedded migrations.
- Add forward-only, previous-image-compatible migrations. Never use GORM `AutoMigrate`.
- `SEED_ADMIN_LOGIN=admin SEED_ADMIN_PASSWORD='replace-me' make seed` idempotently creates or updates only an admin. `SEED_ADMIN_NAME` is optional; shops and assignments require manual provisioning.
- Follow `DEPLOYMENT.md` for deployment, rollback, and coordinated database/media backups.
