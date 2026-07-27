# ردیف MVP Implementation Plan

## 1. Goal

Build a Persian, right-to-left, mobile-first pilot for Instagram shops that turns a confirmed DM sale into a trackable order.

The workflow to validate is:

```text
Admin creates order
→ sends customer link
→ customer provides delivery details and receipt
→ admin updates fulfillment status
→ customer checks the same link
```

The primary success condition is that a repeat order can be created and its link copied in under 30 seconds without adding more work than the tool removes.

## 2. Pilot Scope

### Included

- Seeded admin accounts
- Seeded shops, products, product images, and payment instructions
- Admin login and session management
- Switching between an admin's shops
- Fast multi-item order creation with quantities and an editable total amount
- Required estimated delivery date, editable by the admin and visible to the customer
- Optional Instagram username and internal note
- Unique secret customer link for every order
- One-action order creation and link copying
- Persian customer information form
- Iranian mobile number normalization and validation
- Optional postal code and customer note
- Local form draft recovery
- Initial or later payment receipt upload
- Mobile order dashboard with search and status filters
- Order details and protected receipt preview
- Admin correction of submitted customer details
- Quick status changes and status history
- Manual shipment tracking code
- Customer order status page
- Raw pilot event collection and CSV export
- Docker deployment to one persistent VPS
- Database and receipt backup instructions

### Excluded

- Public registration and onboarding
- Password recovery
- Shop and product management screens
- Roles, permissions, and multiple admins per shop
- Telegram or SMS notifications
- Instagram integration or automation
- Inventory, variants, categories, discounts, and carts
- Payment verification or banking integrations
- Custom status workflows
- Analytics dashboards and charts
- Accounting and financial reporting
- Courier integrations
- Desktop-specific tables, sidebars, or layouts

Pilot data changes will be made through the seed command rather than temporary management screens. Add self-service setup only after pilot shops need to change this data frequently.

## 3. Product Decisions

| Decision | Choice |
| --- | --- |
| Working product name | ردیف |
| Product language | Persian only |
| Text direction | RTL |
| Admin access | Accounts created by seed command |
| Shop and product setup | Seeded for pilot shops |
| Customer account | None |
| Customer details after submission | Locked for customer; editable by admin |
| Receipt timing | During initial form or later from the same link |
| Receipt meaning | Uploaded only; admin must confirm payment |
| Payment instructions | Seeded per shop and shown with a copy action |
| Pilot metrics | Raw events and CSV export, no charts |
| Hosting | Persistent VPS |

## 4. Technical Architecture

Use one deployable application and one persistent data volume.

```text
Browser
   |
   v
Go application using Echo
├── /api/*          JSON API
├── protected receipt responses
└── /*              compiled React application
        |
        ├── GORM → SQLite
        └── local receipt directory

Persistent VPS volume
├── app.db
└── receipts/
```

The Vite development server proxies API requests to Go. In production, Echo serves the compiled frontend, so no separate frontend service or API gateway is required.

### Backend

- Go 1.26
- Echo for routing and middleware
- GORM with the official SQLite driver
- GORM models and direct queries without repository or service layers
- `AutoMigrate` for the pilot schema
- Explicit transactions for order submission and status history
- Standard library JSON, CSV, cryptography, and file handling where possible
- bcrypt password hashes
- Opaque database-backed sessions in secure HTTP-only cookies

Explicit SQL may replace GORM for a query when it is shorter or clearer, especially search and CSV export.

### Frontend

- React
- TypeScript
- Vite
- React Router
- Tailwind CSS v4
- Lucide React icons
- Self-hosted Persian fonts
- Native `fetch` and component state
- Native `Intl.NumberFormat` and `Intl.DateTimeFormat` with Persian locale

Do not add a state manager, query library, form library, UI kit, CSS-in-JS solution, or localization framework for the single-language pilot.

### Deployment

- Multi-stage Docker image
- One application container with a mounted `/data` directory
- Existing VPS reverse proxy handles HTTPS
- Add Caddy only if the VPS has no TLS reverse proxy
- Environment variables provide cookie settings, origin, session lifetime, upload limits, and seed credentials
- Daily SQLite-safe backup plus receipt directory backup

## 5. Data Model

### `admins`

- ID
- Name
- Mobile or username used for login
- Password hash
- Active flag
- Created timestamp

### `sessions`

- Opaque token hash
- Admin ID
- Expiry timestamp
- Created timestamp

### `shops`

- ID
- Owner admin ID
- Name
- Optional logo path
- Optional short description
- Payment instructions
- Active flag
- Created and updated timestamps

One owner column is sufficient because multi-admin collaboration is outside the pilot.

### `products`

- ID
- Shop ID
- Name
- Main image path
- Default price in toman as an integer
- Short description
- Active flag
- Created and updated timestamps

### `orders`

- ID used to produce the visible order code
- Secret customer token
- Shop ID
- Amount in toman
- Estimated delivery date
- Instagram username
- Internal note
- Customer full name
- Normalized mobile number
- Full address
- Optional postal code
- Optional customer note
- Receipt file path and upload timestamp
- Current status
- Shipment tracking code
- Customer submission timestamp
- Created and updated timestamps

### `order_items`

- ID
- Order ID
- Product ID
- Quantity
- Product unit price at order creation
- Created timestamp

### `order_status_history`

- ID
- Order ID
- Previous status
- New status
- Changed-by admin ID when applicable
- Created timestamp

### `pilot_events`

- ID
- Event name
- Order ID when applicable
- Admin ID when applicable
- Small JSON metadata payload
- Created timestamp

Do not introduce separate receipt, address, event-property, or audit tables until one-to-many behavior is actually required.

## 6. Order Statuses

| Internal value | Persian label |
| --- | --- |
| `waiting_info` | در انتظار اطلاعات مشتری |
| `waiting_payment` | در انتظار پرداخت |
| `paid` | پرداخت شده |
| `preparing` | در حال آماده‌سازی |
| `shipped` | ارسال شده |
| `cancelled` | لغو شده |

Rules:

- A new order starts at `waiting_info`.
- Customer form submission changes it to `waiting_payment`.
- Uploading a receipt never changes it to `paid`.
- The admin may choose any status; the pilot will not enforce a custom workflow engine.
- Every actual status change adds one history entry.
- A tracking code is visible to the customer when present.
- Later receipt upload closes after payment confirmation or cancellation.

## 7. API Surface

Keep the API small and same-origin.

### Admin API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/session` | Log in |
| `DELETE` | `/api/session` | Log out |
| `GET` | `/api/me` | Current admin and shops |
| `GET` | `/api/shops/:shopID/products` | Active seeded products |
| `POST` | `/api/orders` | Create an order |
| `GET` | `/api/orders` | List, search, and filter orders |
| `GET` | `/api/orders/:orderID` | Order details and history |
| `PATCH` | `/api/orders/:orderID` | Correct details, change status, or add tracking code |
| `GET` | `/api/orders/:orderID/receipt` | Authorized receipt response |
| `GET` | `/api/pilot-events.csv` | Export pilot data |

### Customer API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/o/:token` | Form context or public status data |
| `POST` | `/api/o/:token/details` | Submit customer details and optional receipt |
| `POST` | `/api/o/:token/receipt` | Upload a receipt after form submission |

Admin order responses may include private operational data. Customer responses must include only shop identity, product summary, amount, estimated delivery date, public status, latest update, receipt state, and tracking code.

## 8. UX Direction

### Visual Identity

`ردیف` should feel like a calm digital order ledger rather than a generic analytics dashboard.

| Token | Value | Use |
| --- | --- | --- |
| Lapis ink | `#183B4E` | Primary text and navigation |
| Paper | `#F7F9F8` | Main application background |
| Ledger blue | `#E4EEF0` | Surfaces and separators |
| Saffron | `#E9A928` | Primary action and attention |
| Confirmation teal | `#287266` | Successful and completed states |
| Error red | `#B94B48` | Destructive actions and errors |

The signature element is a narrow colored status rail on each order card, making the list readable like a stack of organized order slips. Decoration that does not communicate order state should be removed.

### Layout

- Design one mobile interface with a maximum width around `480px`.
- Center that interface on desktop over a quiet branded background.
- Do not draw fake device chrome around the application.
- Keep mobile cards on desktop rather than switching to tables.
- Keep navigation and fixed actions constrained to the same centered viewport.
- Use safe-area padding for devices with display cutouts.
- Avoid hover-only behavior so desktop and mobile interactions stay identical.

### Typography and Accessibility

- Use a self-hosted Persian variable font.
- Use Persian labels, errors, dates, digits, and status names.
- Keep technical identifiers such as URLs and order tokens out of normal UI copy.
- Provide visible keyboard focus.
- Use semantic form labels and error associations.
- Keep interactive targets at least 44 pixels high.
- Maintain WCAG AA contrast.
- Respect reduced-motion preferences.
- Test at 320px, 360px, 390px, and the centered desktop viewport.

### Admin Navigation

Use a small bottom navigation:

- سفارش‌ها
- سفارش جدید
- حساب

The current shop stays visible near the top of order screens. Switching shops is explicit and persisted locally. The create screen repeats the selected shop identity to prevent creating an order under the wrong page.

### Fast Order Creation

The shortest repeat flow is:

```text
Select one or more products and quantities
→ amount is prefilled
→ tap “ساخت و کپی لینک”
```

Requirements:

- Remember the current shop.
- Present products as compact, image-backed multi-select choices with quantity controls.
- Prefill the total from selected products and quantities, and allow editing.
- Require an estimated delivery date and show its Persian-calendar preview.
- Keep Instagram username and internal note collapsed or visually secondary.
- Create the order and attempt clipboard copy from one primary action.
- If clipboard access fails, show the link and an obvious retry button.
- Show a concise confirmation with order code and a return-to-orders action.
- Record elapsed creation time as a pilot event.

### Customer Form

- Show shop identity, product, amount, and what happens next before fields.
- Use one page rather than a wizard.
- Use appropriate `autocomplete` and `inputmode` attributes.
- Persist text fields to local storage under the secret order token.
- Clear the draft only after successful submission.
- Show shop payment instructions with a copy action.
- Allow an optional screenshot upload.
- Explain that receipt upload does not itself confirm payment.
- Use direct Persian validation messages beside the relevant field.
- Keep entered text after network and server errors.

### Order Dashboard

- Use a compact card list at every viewport size.
- Put order code, product, customer, amount, age, receipt indicator, and status on the card.
- Show missing customer details clearly for `waiting_info` orders.
- Use status chips as the main filter.
- Search name, mobile, order code, and Instagram username from one field.
- Use a fixed “سفارش جدید” action where it does not cover content.
- Provide an empty state that points directly to creating the first order.
- Avoid pagination for pilot volume; return a safe capped result set.

### Order Details

- Keep operational actions near the top.
- Change status in no more than two interactions.
- Show copy actions for mobile number, address, customer link, and tracking code.
- Let the admin update the estimated delivery date.
- Protect receipt preview behind admin authentication and shop ownership.
- Let the admin correct customer information.
- Show the simple status history beneath current information.
- Keep internal notes visually and technically separate from customer-visible data.

### Customer Status Page

- Reuse the same secret link after submission.
- Show order code, shop, product, amount, current status, and latest update.
- Show the current estimated delivery date.
- Present a simple vertical timeline derived from status history.
- Offer later receipt upload while it is allowed.
- Show and copy the tracking code when available.
- Never expose address, internal notes, admin identity, or other orders.

## 9. Validation and Security

- Generate customer tokens with `crypto/rand` and enough entropy to resist guessing.
- Generate session tokens independently and store only their hashes.
- Use secure, HTTP-only, same-site cookies in production.
- Check the configured application origin on mutating admin requests.
- Rate-limit repeated login failures in-process for the single-instance pilot.
- Verify shop ownership on every admin order and receipt request.
- Normalize Persian and Arabic digits before validating mobile numbers and postal codes.
- Normalize Iranian mobile forms such as `+98`, `0098`, and `98` to `09xxxxxxxxx`.
- Require a normalized Iranian mobile matching `09` plus nine digits.
- Accept an optional ten-digit postal code.
- Validate all fields again on the server.
- Limit request and multipart body sizes.
- Detect receipt content from bytes rather than trusting its extension.
- Accept only JPEG, PNG, and WebP receipts.
- Generate receipt filenames rather than using customer filenames.
- Store receipts outside the public static directory.
- Use temporary files and move them only after validation succeeds.
- Add baseline security headers and a restrictive content security policy.
- Enable SQLite foreign keys, WAL mode, and a busy timeout.

## 10. Pilot Events

Record only events needed to evaluate the product hypotheses:

- `admin_login`
- `order_create_started`
- `order_created`
- `order_link_copied`
- `customer_link_opened`
- `customer_form_submitted`
- `receipt_uploaded`
- `customer_status_viewed`
- `order_status_changed`
- `tracking_code_added`

Useful metadata includes elapsed order creation milliseconds, previous and new status, whether a receipt accompanied initial submission, and user-agent category. Do not copy customer PII into event metadata.

The CSV export should support measuring:

- Orders created per active admin day
- Median order creation time
- Link-open rate
- Form-completion rate
- Time from creation to completion
- Number of customer status views
- Status progression and age

Confirmed sales omitted from the system, reasons for omission, follow-up DM counts, and willingness to pay must be collected during pilot interviews rather than by adding admin data-entry work.

## 11. Implementation Tasks

Each milestone should leave the application runnable and demonstrable.

### M0: Record the Plan

- Add this implementation plan.
- Add a short README with local prerequisites and commands as those commands become real.
- Keep the original product document unchanged.

Acceptance check: product boundary, chosen stack, UX direction, and exclusions are committed to writing.

### M1: Application Skeleton

- Initialize the Go module.
- Add Echo and a health endpoint.
- Initialize the React and TypeScript Vite application.
- Add React Router, Tailwind CSS v4, icons, and Persian font assets.
- Proxy `/api` to Echo in development.
- Serve the compiled frontend with SPA fallback in production.
- Add shared development and production commands.

Acceptance check: the health endpoint responds, Vite development works, and a production frontend build loads through Go.

### M2: Database and Seed Data

- Configure GORM and SQLite pragmas.
- Add the eight pilot models and relationships.
- Run `AutoMigrate` during controlled application startup.
- Add an idempotent seed subcommand for admins, shops, and products.
- Store seed credentials in environment variables rather than source files.
- Add representative Persian development data and replaceable sample images.

Acceptance check: a blank data directory can be initialized and seeded repeatedly without duplicate records.

### M3: Authentication and Boundaries

- Implement login and logout.
- Create, validate, expire, and delete database sessions.
- Add authentication and ownership middleware.
- Add origin checking, secure cookies, login throttling, and security headers.
- Return consistent Persian-safe API errors without exposing internals.

Acceptance check: unauthenticated, expired-session, cross-shop, and invalid-origin requests are rejected.

### M4: Mobile Application Shell

- Implement design tokens in Tailwind.
- Set global Persian locale and RTL direction.
- Build the login screen.
- Build the centered mobile viewport and desktop background.
- Add bottom navigation and current-shop switcher.
- Add reusable loading, error, empty, input, button, badge, and toast patterns only as they become necessary.

Acceptance check: login and navigation work at 320px through desktop without introducing a separate desktop layout.

### M5: Fast Order Creation

- Load active products for the current shop.
- Build multi-product selection, quantity controls, and prefilled total editing.
- Add optional Instagram username and internal note.
- Create a secret token and initial history entry in one transaction.
- Implement “ساخت و کپی لینک” and clipboard fallback.
- Record creation timing and copy events.

Acceptance check: a repeat order can be created and its link copied through one primary action after product selection.

### M6: Customer Information and Receipt

- Build the public token lookup endpoint.
- Build product summary, payment instructions, and one-page customer form.
- Implement Persian digit and Iranian mobile normalization.
- Add local draft persistence and recovery.
- Validate and store details atomically.
- Add optional initial receipt upload.
- Move status to `waiting_payment` and append history after successful submission.
- Add later receipt upload while allowed.

Acceptance check: refresh and validation errors preserve text, a successful submission locks customer editing, and receipt upload does not mark payment as paid.

### M7: Order Operations

- Build the card-based order list.
- Add status filter, shop filter, recent ordering, and one-field search.
- Build the order details page.
- Add protected receipt preview.
- Add admin customer-detail correction.
- Add quick status updates and status history.
- Add tracking code entry and copy action.

Acceptance check: an admin can find and operate an order without returning to Instagram DMs, and status changes require no more than two interactions.

### M8: Customer Status Experience

- Switch the public route from form to status view after submission.
- Add a Persian status summary and timeline.
- Display latest update and receipt state.
- Show later receipt upload when allowed.
- Show tracking code when present.
- Verify the response never contains private admin data.

Acceptance check: the same secret link displays current progress without exposing customer address or internal notes.

### M9: Pilot Measurement

- Record the agreed events on the server.
- Deduplicate noisy link-open events within a short window.
- Add the admin-only CSV export.
- Document how each success criterion is calculated and which items require interviews.

Acceptance check: a completed test order produces enough exported data to calculate creation time, link open, form completion, and status views.

### M10: Verification and Deployment

- Add focused Go tests for authentication, ownership, customer-token isolation, submission, receipt rules, and status history.
- Add one core browser journey check if it can remain stable and small.
- Run frontend type checking and production build.
- Verify keyboard operation, focus, RTL, reduced motion, and narrow screens manually.
- Test Instagram-like in-app browser constraints on iOS and Android during the pilot.
- Add the production Docker image and persistent volume configuration.
- Document environment variables, TLS proxying, seeding, backups, restoration, and upgrades.
- Perform one restore rehearsal before real pilot orders are accepted.

Acceptance check: the complete core journey passes in production mode and backed-up database and receipt data can be restored.

## 12. Core Journey Test

The smallest meaningful end-to-end check covers:

1. Admin logs in.
2. Admin creates an order.
3. A unique customer token and visible order code are generated.
4. Customer opens the link.
5. Customer sees the correct shop, products, amount, and payment instructions.
6. Customer submits valid delivery details and a receipt.
7. Order remains `waiting_payment`.
8. Admin views the protected receipt and marks the order paid.
9. Admin moves the order to preparing and then shipped.
10. Admin adds a tracking code.
11. Customer sees the updated timeline and tracking code.
12. Another token and another admin cannot access the order.
13. Pilot events export contains the journey without customer PII in metadata.

## 13. Definition of Done

The pilot is ready when:

- All primary UI is Persian and RTL.
- The application works at 320px and as a centered mobile view on desktop.
- Admin creation and copy flow is realistically timed under 30 seconds.
- Customer fields survive refresh and recoverable errors.
- Public links are isolated by secret token.
- Admin data is isolated by shop ownership.
- Receipts are type-checked, size-limited, and protected.
- Status and receipt behavior matches the documented rules.
- The customer can see shipment progress from the original link.
- Raw pilot metrics can be exported.
- Production data persists across container restarts.
- Backup restoration has been tested.
- The core journey check passes.

## 14. Pilot Review

Run the pilot with two shops for at least two weeks or 20 real orders, whichever takes longer. Review weekly rather than building speculative improvements during the trial.

Continue only if the evidence trends toward:

- At least 80% of confirmed sales entered as orders
- Median creation time below 30 seconds
- At least 70% customer form completion without assistance
- Near-zero lost information for registered orders
- Admin use on at least four days per week
- The dashboard becoming the primary order lookup tool
- At least one shop willing to pay for another month

If usage fails, interview first. Do not respond by adding features unless evidence identifies a specific missing step in the core workflow.
