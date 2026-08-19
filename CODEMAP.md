# Radif Code Map

Use this document after `AGENTS.md` when a task crosses files or the owning code is unclear. It is a navigation index, not implementation authority. Verify behavior in the referenced source and tests.

## Runtime Map

| File | Responsibility and useful symbols |
| --- | --- |
| `main.go` | Process lifecycle, cleanup scheduler, route registration, security/static middleware, API errors. Start at `run`, `newServer`, `startStaleOrderCancellation`. |
| `config.go` | Environment defaults and upload paths. Start at `loadConfig`, `dataDir`. |
| `database.go` | PostgreSQL pool and embedded Goose migration startup. Start at `openDatabase`, `migrationFiles`. |
| `models.go` | GORM representations of all persisted records. SQL migrations remain schema authority. |
| `auth.go` | Login/logout, sessions, `/api/me`, shop support settings, authentication, shop scope, exact-origin middleware. |
| `seed.go` | Idempotent single-admin create/update from `SEED_ADMIN_*`; no shop or product seeding. |
| `orders.go` | Normal creation/idempotency, list/search/sort, admin updates, public/admin responses, receipts, link rotation, cleanup. |
| `historical_orders.go` | Multipart import of existing orders and import retry fingerprint. |
| `customer.go` | Customer normalization/validation and atomic details plus first-receipt submission. |
| `installment_payments.go` | Final-payment request, public final-receipt upload, admin confirmation, protected receipt serving. |
| `products.go` | Product CRUD-like lifecycle: list, create, full-form update, archive/reactivate, public image serving. |
| `images.go` | Shared bounded image upload, MIME sniffing, temporary file, commit/discard primitive. |
| `payment_cards.go` | Card/IBAN normalization, create/update/activate, projection of active payment data onto the shop. |
| `reports.go` | All-time shop summary and top products confirmed by current `paid`, `preparing`, or `shipped` status. Start at `shopReport`. |
| `pilot_events.go` | Allowlisted pilot telemetry, deduplication, view buckets, failure caps, coarse user-agent classification. |

## Frontend Map

| File | Responsibility |
| --- | --- |
| `web/src/main.tsx` | React root, router, global CSS, service-worker registration. |
| `web/src/App.tsx` | Public/auth split, `/api/me` session bootstrap, unauthorized event handling, top-level lazy routes. |
| `web/src/AdminApp.tsx` | Authenticated shell, shop persistence/switching, bottom navigation, install prompt, admin routes. |
| `web/src/shared.ts` | Domain types, `api`, `ApiError`, telemetry, labels, formatting, persistence helpers, working-day calculations, sharing, random IDs. |
| `web/src/components.tsx` | Shared UI, product choices, copying, receipt picker and client-side receipt optimization. |
| `web/src/DeliveryDateSelect.tsx` | Persian date picker, past-date option for imports, working-day shortcuts. |
| `web/src/pages/LandingPage.tsx` | Public marketing/pilot landing page. |
| `web/src/pages/LoginPage.tsx` | Cookie-session login. |
| `web/src/pages/CreateOrderPage.tsx` | Normal order creation, product quantities, split amount, retry key, sharing result. |
| `web/src/pages/HistoricalOrderPage.tsx` | Existing-order import, customer/status/receipt entry, review and separate retry key. |
| `web/src/pages/OrdersPage.tsx` | Active/archive/search views, URL filters/sorts, progressive 20-item pagination. |
| `web/src/pages/AdminOrderPage.tsx` | Full private record, corrections, statuses, receipts, link rotation, split-payment actions, history. |
| `web/src/pages/PublicOrderPage.tsx` | Token-based customer details/receipt flow, masked status view, final receipt, support. |
| `web/src/pages/ProductsPage.tsx` | Active/archive product list and lifecycle actions. |
| `web/src/pages/ProductFormPage.tsx` | Product create/edit and square WebP crop. |
| `web/src/pages/AccountPage.tsx` | Admin identity, payment cards/IBAN, active card, support contacts, share template, logout. |
| `web/src/pages/ReportPage.tsx` | Status-derived shop totals and top products. |
| `web/src/styles.css` | Tailwind import, theme tokens, operational 480px shell, wider landing layout, component CSS. |

## Route Ownership

`main.go:newServer` is the exact route/middleware index. Route families map as follows:

| Route family | Handler owner | UI owner |
| --- | --- | --- |
| `/api/session`, `/api/me` | `auth.go` | `App.tsx`, `LoginPage.tsx`, `AdminApp.tsx` |
| `/api/shops/:shopID/products*`, `/api/product-images/*` | `products.go`, `images.go` | product pages and `components.tsx` |
| `/api/orders`, `/api/orders/:orderID*` | `orders.go` | create, list, and admin order pages |
| `/api/orders/import` | `historical_orders.go` | `HistoricalOrderPage.tsx` |
| `/api/o/:token`, `/api/o/:token/details` | `orders.go`, `customer.go` | `PublicOrderPage.tsx` |
| `*/final-payment/*` | `installment_payments.go` | admin and public order pages |
| `/api/shops/:shopID/payment-cards*` | `payment_cards.go` | `AccountPage.tsx` |
| `/api/shops/:shopID/support` | `auth.go` | `AccountPage.tsx` |
| `/api/shops/:shopID/report` | `reports.go` | `ReportPage.tsx` |
| `*/pilot-events`, `*/support-click`, `*/link-copied` | `pilot_events.go`, selected order handlers | `shared.ts` and page callers |

All private order routes contain only `orderID`, so handlers enforce shop assignment themselves. When adding or changing one, compare every sibling route and grep `JOIN admin_shops` or `findAdminOrder`.

## Core Flows

### Startup

```text
main -> run -> loadConfig -> openDatabase -> embedded Goose migrations
     -> immediate stale-order cleanup -> hourly cleanup
     -> newServer -> Echo :8080 -> graceful signal shutdown
```

The `seed` subcommand opens/migrates the same database, calls `seed`, and exits.

### Normal Order Creation

```text
CreateOrderPage sessionStorage createKey
-> POST /api/orders
-> createOrder validates and fingerprints normalized input
-> transaction locks assigned active shop and selected active products
-> order snapshots payment profile and item prices
-> unique create_key insert + items + initial history + pilot event
-> same key/same fingerprint returns existing order; changed payload returns 409
-> frontend removes key only after success
```

The fingerprint contract and browser key lifecycle are one feature. Search `createKey`, `CreateFingerprint`, and `errOrderAlreadyCreated` before changing either side.

### Historical Import

`HistoricalOrderPage` uses a separate per-shop session key. `importHistoricalOrder` accepts past delivery dates, requires customer details, forbids `waiting_info`, requires a receipt for `waiting_payment`, includes receipt bytes in its fingerprint, and records the chosen status as initial history.

### Customer Submission

```text
PublicOrderPage restores token-scoped text draft and prepares multipart receipt
-> submitCustomerDetails validates fields and exactly one image
-> prepareImage writes a bounded temporary JPEG/PNG/WebP
-> transaction re-locks order by ID and token
-> conditional one-time update stores customer/receipt and changes
   waiting_info -> waiting_payment
-> history and pilot events commit with the write
-> publicOrderResponse returns masked customer data
```

The frontend may resize/convert receipts, but server validation is mandatory. The filesystem rename and database transaction are coordinated but not crash-atomic.

### Admin Order Work

`listOrders` owns active/archive/search/status/sort/pagination behavior. `findAdminOrder` is the common scoped aggregate load. `updateOrder` owns customer corrections, private metadata, delivery date, tracking code, and status changes. Re-saving a status adds no history; submitted orders cannot return to `waiting_info`; entering `waiting_payment` requires an initial receipt.

### Split Payment

```text
requestFinalPayment -> validate split/first payment/status -> snapshot current payment profile
submitFinalReceipt  -> validate token/request/non-cancelled state -> store one image
confirmFinalPayment -> validate scoped order and receipt -> record admin/time
```

Final-payment state is parallel to fulfillment status; confirmation does not change the order status.

## Data And Storage

- Structured data is PostgreSQL through GORM; there is no storage abstraction layer.
- Receipts use `DATA_DIR/receipts`; the database stores generated basenames only.
- Product images use `DATA_DIR/product-images`; the database stores public `/api/product-images/<file>` paths.
- Initial and final receipts are authenticated, shop-scoped, and served with `no-store`; product images are public and immutable-cached.
- Order items freeze unit price. Product name/image remain live associations.
- Orders freeze payment details at creation/import. Final-payment requests freeze another payment profile for the remainder.
- `shops.payment_*` mirrors the active card. Active-card identity is inferred from card-number equality, not a foreign key.
- Public customer tokens are raw, non-expiring bearer secrets because admins must retrieve them; rotation is immediate revocation.

## Migration Map

| Migration | Adds or changes |
| --- | --- |
| `00001_initial.sql` | Core admins, sessions, shops, products, orders, items, histories, pilot events. |
| `00002_admin_shops.sql` | Many-to-many admin/shop assignments. |
| `00003_shop_support_contacts.sql` | Instagram/WhatsApp contacts and selected support channel. |
| `00004_shop_share_message_template.sql` | Per-shop customer-link message template. |
| `00005_shop_payment_cards.sql` | Multiple cards and order payment snapshots. |
| `00006_order_installments.sql` | Split amounts, final request/receipt/confirmation fields. |
| `00007_order_sales_channel.sql` | Sales channel and conversation reference. |
| `00008_pilot_event_context.sql` | Event shop/key context and deduplication indexes. |
| `00009_payment_card_iban.sql` | Optional IBAN fields on shops, cards, and payment snapshots. |

Migrations are forward-only and must remain compatible with the previous application image. The database does not constrain order status values; application validation is required.

## Test Map

| Test file | Main coverage |
| --- | --- |
| `database_test.go` | Isolated schema helper, migrations, schema relations, repeatable seed. |
| `main_test.go` | Health, routing, SPA/PWA cache behavior. |
| `auth_test.go` | Session lifecycle, throttle, shop assignment, support, cards, IBAN. |
| `products_test.go` | Product/image lifecycle, validation, ownership, cleanup and caching. |
| `orders_test.go` | Creation/idempotency, snapshots, privacy, list/search/sort, updates, cleanup, receipts. |
| `historical_orders_test.go` | Import, fingerprint/retries, past dates, receipt and ownership rules. |
| `customer_test.go` | Normalization, multipart submission, atomicity, masking, MIME/size checks. |
| `installment_payments_test.go` | Full final-payment flow, snapshots, idempotency, privacy and scope. |
| `reports_test.go` | Report calculations, empty state, authentication and scope. |
| `pilot_events_test.go` | Event allowlists, deduplication, privacy, context, origin/token rules and caps. |

Most integration tests need PostgreSQL and create/drop isolated schemas. Pure normalization tests can run without it.

## Browser Persistence

| Key | Purpose |
| --- | --- |
| `radif_create_key_<shopID>` | Normal order retry identity, kept until successful creation. |
| `radif_historical_create_key_<shopID>` | Historical import retry identity. |
| `radif_customer_draft_<token>` | Public customer text draft; removed after submission. |
| `radif_sales_channel` | Last selected admin sales channel. |
| `radif_shop_id` | Active admin shop. |
| `radif_install_dismissed_at` | PWA prompt suppression. |

Authentication stays in the HTTP-only server session cookie; no auth token or password is browser-stored.

## High-Value Searches

```text
Startup/routes:   run|newServer|apiErrorHandler|startStaleOrderCancellation
Security/scope:   requireAdmin|requireShopAccess|requireOrigin|findAdminOrder|JOIN admin_shops
Creation/retry:   createOrder|importHistoricalOrder|createKey|CreateFingerprint|create_key
Statuses:         validOrderStatuses|waitingInfoStatus|waitingPaymentStatus|cancelStaleWaitingInfoOrders
Public privacy:   publicOrderResponse|adminOrderResponse|customerSummary|serveReceipt
Uploads:          submitCustomerDetails|prepareReceipt|prepareImage|pendingImage
Final payment:    requestFinalPayment|submitFinalReceipt|confirmFinalPayment
Products:         parseProductInput|ownedProduct|setProductActive|productImageURLPrefix
Cards/support:    ownedPaymentCard|activatePaymentCard|updateShopSupport|PaymentCardNumber
Telemetry:        recordPilotEvent|observePilotEvent|EventName:|sendPilotEvent
Frontend routes:  <Route path=|api<|/api/
Browser state:    localStorage|sessionStorage|radif_
Schema:           CREATE TABLE|ALTER TABLE|CONSTRAINT|CREATE UNIQUE INDEX
```

## Maintenance Traps

- `IRANIAN_HOLIDAYS` in `web/src/shared.ts` currently covers Jalali year 1405 only, while the picker permits later dates.
- `GET` order/list/public handlers perform nonfatal analytics writes; do not let passive observation failures break reads.
- Some core pilot events are inside write transactions and therefore can roll back the business write on event insertion failure.
- `me` hides inactive shops and create/import reject them, but existing-record management generally does not require active shops.
- Customer links never expire and customer/media records have no automatic retention policy.
- Product upload rename plus DB transaction is best-effort atomic; a process crash can orphan a file.
- Frontend verification is typecheck/build only; there is no test, lint, formatter, or E2E configuration.
