# Radif Product Context

> Current product truth for product planning and AI conversations.
>
> Last reviewed against the implemented application: 2026-08-04.
>
> The older `instagram_order_mvp_product_document_en.md` and `MVP_PLAN.md`
> explain the original intent, but they also contain planned or outdated
> behavior. When they disagree with this document, use this document as the
> product-level source of truth and the code as the final source of truth.

## 1. Product Snapshot

**Name:** Radif (`ردیف`)

**Stage:** Working MVP / pilot

**Market:** Small Iranian Instagram shops selling physical products, initially
shops such as home decor and lampshade sellers.

**Product language:** Persian, right-to-left, mobile-first.

**Core promise:** Keep selling through Instagram DMs, but organize the order
after the customer decides to buy.

Radif is the operational layer between a confirmed Instagram sale and order
fulfillment. It helps a shop create a structured order, collect customer and
payment-receipt information, manage fulfillment, and let the customer check
progress from one link.

Radif is not currently a storefront, CRM, inventory system, payment gateway,
Instagram automation tool, or courier platform.

## 2. Problem Being Solved

Small Instagram shops often use one DM conversation for product questions,
price negotiation, customer details, addresses, payment receipts, fulfillment,
and support. This causes predictable operational problems:

- Addresses and receipts are difficult to find later.
- Paid or active orders can be forgotten.
- The shop cannot quickly see which orders need attention.
- Customer details are copied manually and may contain mistakes.
- Customers repeatedly ask whether payment was accepted or an order shipped.
- Managing more than one Instagram page increases confusion.

Radif does not try to replace the shop's conversational sales process. It starts
only after the customer has agreed to buy, because that is where structure adds
value without disrupting how the shop sells.

## 3. Users And Jobs

### Shop Operator

The primary user is a shop owner or operator who handles sales in Instagram
DMs and needs to:

- Register a confirmed sale quickly.
- Send the customer one trustworthy next-step link.
- Keep products, customer details, receipts, and status together.
- Find active and urgent orders without searching conversations.
- Correct customer information and manage fulfillment.
- Reduce repeated customer status questions.

The key adoption constraint is speed: creating an order and handing its message
back to the customer should take less than 30 seconds for a repeat workflow. If
Radif creates more work than it removes, operators will return to DMs and notes.

### Customer

The secondary user is a mobile customer opening a link from Instagram's
in-app browser. They need to:

- Recognize the shop and order before sharing personal information.
- See the products, amount, delivery estimate, and payment instructions.
- Submit delivery details and the requested payment receipts without creating an account.
- Know that the order was registered.
- Revisit the same link for fulfillment status and a tracking code.

### Pilot Operator

A technical or business operator provisions admin accounts and shops, deploys
the application, and protects the database and uploaded media. This is a manual
pilot role, not a self-service product experience.

## 4. End-To-End Journey

```text
Sale is agreed in Instagram DMs
-> shop operator selects products and creates an order
-> Radif creates an order code and secret customer link
-> Radif copies a prepared message and the operator sends or shares it in the DM
-> customer sees the order and card-transfer instructions
-> customer submits delivery details and the first receipt together
-> order waits for manual payment confirmation
-> operator reviews the receipt and manages fulfillment
-> for a split-payment order, operator may request and confirm the final receipt
-> customer revisits the same link for status and tracking
```

For orders already being managed elsewhere, the operator can instead import the
products, customer details, current status, and optional receipt directly. The
customer link then starts as a status destination rather than an information
form.

## 5. Current Feature Inventory

Everything in this section is implemented today.

### 5.1 Public Landing And Pilot Entry

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Persian landing page | Explains the post-DM workflow with example order and dashboard visuals. | Helps a shop understand the narrow value proposition without presenting Radif as a full e-commerce platform. |
| Three-step explanation | Describes agreeing in DMs, creating and sending a link, and managing the order in one place. | Makes the behavior change feel small and compatible with the shop's current sales style. |
| Limited pilot call to action | Offers a 14-day pilot through a WhatsApp link. | Supports hands-on pilot recruitment before building self-service onboarding or billing. |
| Admin login entry | Existing operators can move from the landing page to the private application. | Keeps acquisition and daily operations in one product while protecting shop data. |

### 5.2 Admin Access And Shop Context

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Admin login | Seeded operators sign in with a login and password. Failed attempts are throttled. | Protects customer details, receipts, and internal notes without adding a complex onboarding system. |
| Persistent session | A secure server-backed session keeps the operator signed in until logout or expiry. | Reduces repeated login friction for a tool expected to be used throughout the working day. |
| Session recovery | Protected screens check the current session and return expired users to login. | Prevents operators from interacting with stale private screens. |
| Shop-scoped access | An admin sees only shops assigned to them and only those shops' products, orders, and receipts. | Prevents accidental or unauthorized data exposure between businesses. |
| Multiple shops per admin | An operator can switch between assigned active shops, and the selection is remembered in the browser. | Supports people managing more than one Instagram page while keeping each order under the correct shop. |
| Shared shop access | More than one admin can technically be assigned to the same shop. | Allows basic collaboration even though role and team-management screens do not exist yet. |
| Persistent shop identity | The active shop remains visible in the application header and is repeated during order creation. | Reduces wrong-shop order creation, especially for multi-page operators. |
| Account summary and logout | Shows the operator's name, login, accessible-shop count, and a logout action. | Provides identity confirmation and safe session termination alongside the limited shop settings. |
| Shop communication settings | An assigned operator can configure the shop's Instagram and WhatsApp contacts, choose which one appears on public orders, and customize the order-sharing message. | Makes the customer handoff and support path adjustable without requiring technical provisioning for routine text and contact changes. |
| Payment-card settings | An assigned operator can add multiple 16-digit cards, edit their payment instructions, and choose the active card for future orders. Card numbers cannot currently be edited or deleted. | Supports changing payment destinations without changing old orders or requiring direct database work. |

### 5.3 Product Catalog For Order Entry

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Product list | Shows active and archived products for the selected shop with image, name, description, and default price. | Gives operators a reusable private catalog for faster order creation. |
| Product creation | Creates a product with a required name, positive default price, one image, and optional description. | Stores only the recurring information needed to create recognizable orders quickly. |
| Image crop and upload | The frontend lets the operator crop and zoom a square image before upload; the server accepts JPEG, PNG, or WebP. | Produces consistent, customer-recognizable product images without requiring external editing. |
| Product editing | Updates name, price, description, and optionally replaces the image. | Lets shops keep current selling information accurate. |
| Archive and restore | Products can be removed from new-order selection and restored later without deleting historical references. | Keeps order creation uncluttered while preserving past order records. |
| Active-product enforcement | Only active products from the active selected shop can be used in new orders. | Prevents operators from accidentally selling archived or cross-shop items. |

This catalog is an operational shortcut, not a public storefront. Customers do
not browse it and cannot build carts themselves.

### 5.4 Fast Order Creation

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Multi-product selection | The operator selects up to 50 distinct active products and quantities from 1 to 99. | Supports realistic Instagram sales without requiring a cart or full checkout system. |
| Automatic total | The interface calculates the total from product prices and quantities. | Removes repetitive arithmetic and speeds up repeat orders. |
| Editable amount | The operator may override the calculated total with a positive toman amount. | Supports negotiated prices and one-off adjustments common in DM sales without building discounts or promotions. |
| Optional split payment | For a new order, the operator may enter an initial amount below the total; Radif derives and clearly shows the exact remainder. Existing and imported orders stay single-payment. | Supports shops that collect part of the price before preparation and the remainder before dispatch without adding a general installment engine. |
| Estimated delivery date | A required Persian-friendly date is visible to both operator and customer. The UI allows today through roughly two years ahead; the API requires today or later. | Creates a concrete fulfillment expectation and powers urgency-based order triage. |
| Optional Instagram username | The customer's Instagram handle can be attached to the internal order. | Preserves a lightweight link back to the original conversation when needed. |
| Optional internal note | The operator may save private context that is never shown publicly. | Keeps operational exceptions beside the order instead of buried in DMs. |
| Order code | Every created order receives a short visible code based on its record ID. | Gives operators and customers an easy reference that is safer to discuss than a long secret URL. |
| One primary create-and-copy action | Creating the order immediately attempts to copy a ready-to-send Persian message containing the customer link. | Optimizes the core handoff back to the Instagram conversation instead of leaving the operator to compose the message. |
| Custom sharing message | Each shop may customize the message using placeholders for shop name, order code, customer URL, amount, and delivery date. | Preserves the shop's preferred customer tone without building message automation. |
| Native sharing and clipboard fallback | Compatible phones offer the native share sheet after creation. The success screen also keeps the bare link visible, selectable, and copyable. | Supports both direct handoff and restrictive mobile or in-app browsers without losing the newly created order. |
| Creation retry protection | A browser-held creation key makes identical retries return the same order and rejects reuse with changed data. | Prevents duplicate orders when the network or clipboard flow leaves the operator unsure whether creation succeeded. |
| Pending-navigation protection | Shop switching, bottom navigation, and accidental page exit are blocked or warned about while creation is submitting. | Reduces duplicate or misplaced orders during the most important write operation. |
| Post-create actions | The operator can correct the delivery date, open the order, return to the list, or start another order. | Supports the immediate follow-up tasks without making the creation form longer. |

New orders start in `waiting_info`, meaning Radif is waiting for the customer to
provide delivery details and a receipt.

### 5.5 Historical Order Import

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Operator-only import | An operator can register an existing order from the active catalog with its actual positive amount, required customer details, and delivery date, including a past date. | Brings orders already tracked in DMs or notebooks into the operational queue without asking the customer to repeat an old workflow. |
| Current-status entry | An imported order must start in `waiting_payment`, `paid`, `preparing`, `shipped`, or `cancelled`; `waiting_info` is not allowed, and `waiting_payment` requires a receipt. | Treats the customer information as already collected, avoids reopening the public submission form, and reserves payment review for orders with evidence to review. |
| Optional historical evidence | Postal code, Instagram username, internal note, and one receipt are optional unless `waiting_payment` is selected. The selected products, amount, and receipt cannot be corrected after import. | Accepts incomplete historical records while making the irreversible fields explicit in a review step. |
| Retry-safe review and creation | The operator reviews the record before submission, and a browser-held creation key gives imports the same duplicate protection as normal creation. The selected status is recorded as the first history entry. | Prevents transcription mistakes and duplicate imports while preserving a useful starting point for later status history. |
| Import-time history | The original creation and status-change times cannot be entered. Order age, latest update, and initial history use the time of import. | Keeps the import form small, while making clear that Radif is not reconstructing a historically accurate timeline. |

Imported orders still receive an order code and secret customer link, and they
snapshot the active payment card and instructions. Because customer details are
already marked as submitted, the public link is immediately a status page.

### 5.6 Secret Customer Order Link

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| One active high-entropy link per order | Anyone possessing the current `/o/:token` can open that order's public experience without an account. | Removes registration, password, SMS, and installation friction from a one-time purchase workflow. |
| Order-specific context | The link shows shop identity, products, quantities, total, delivery estimate, current status, and payment instructions. | Builds trust and prevents the customer from submitting information to an ambiguous generic form. |
| Reusable status destination | The same link changes from an information form into a status page after submission. | Gives the customer one durable place to check progress and reduces support messages. |
| Continued access | The link has no expiry and continues to work after completion or cancellation unless an operator rotates it. | Keeps the pilot experience simple and ensures old customers can revisit their status while providing recovery for a leaked link. |
| Operator rotation | An assigned operator can replace the current link from the order record; the previous token stops working immediately. | Provides a focused recovery action without customer accounts or a token-management system. |

The token is a bearer secret. It should be treated like access to that order and
must not be exposed in public analytics, logs, screenshots, or support material.

### 5.7 Payment Instructions And Customer Submission

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Order payment details | Each order snapshots the shop's active card number and payment instructions at creation or import. The public order displays that snapshot and lets the customer copy the card number. | Fits the card-to-card payment habit used by the initial market while preventing later shop-setting changes from altering an existing payment request. |
| Banking-app amount | The public order shows the total in toman and can copy ten times that value as a rial number. | Reduces currency-conversion mistakes when the customer enters the amount in an Iranian banking application. |
| One-page Persian form | Collects required full name, Iranian mobile, full address, and one receipt; postal code and customer note are optional. | Keeps the task short enough for Instagram's mobile browser and asks only for fulfillment data. |
| Iranian number normalization | Persian, Arabic, and Latin digits are accepted; common `+98`, `0098`, and `98` mobile formats become `09xxxxxxxxx`. | Lets customers enter familiar formats while storing consistent data for operations. |
| Local text draft recovery | Customer text fields are stored under that order token and restored after refresh or recoverable failure. | Protects customers from retyping long addresses on unreliable mobile connections. |
| Receipt preview | A selected image can be previewed, replaced, or removed before submission. | Helps the customer catch the wrong screenshot before the one-time submission. |
| Client-side receipt optimization | Before preview and upload, the browser attempts to limit the image's longest side to 2,000 pixels and convert it to WebP; if this fails, it retains the original accepted file. | Avoids unnecessarily large camera-image uploads without making browser-side conversion a submission requirement. |
| Atomic submission | Customer details and exactly one receipt are accepted together or not at all. | Prevents incomplete operational records where an address exists without payment evidence or vice versa. |
| Validated receipt | The server accepts one non-empty JPEG, PNG, or WebP file within the configured size limit and detects its type from its opening bytes rather than its filename. It does not fully decode the image. | Rejects obvious unsupported uploads and filename spoofing while keeping the pilot upload flow small. |
| One-time customer submission | Submission is allowed only once and only while the order is waiting for information. | Avoids conflicting customer edits after the shop begins payment review and fulfillment. |
| Manual payment distinction | A submitted receipt moves the order to `waiting_payment`, never directly to `paid`. | Avoids falsely claiming payment success when Radif cannot verify bank transactions. |
| Explicit final-payment request | After accepting the first payment, the operator can permanently request the remainder. Radif snapshots the card active at request time and prepares a DM containing the amount and existing customer link. | Keeps the second handoff deliberate and compatible with the shop's existing DM workflow. |
| Final receipt and confirmation | The customer can upload one final receipt from the same link; an assigned operator must explicitly confirm it, recording admin and time. A wrong image remains stored and corrections are handled in DM. | Distinguishes evidence from acceptance while avoiding replacement and dispute-management workflows in the pilot. |

The customer is explicitly told that uploading a receipt does not confirm
payment. The shop operator remains responsible for checking it. Historical
import can mark customer details as submitted without attaching a receipt, but
such an order cannot use `waiting_payment`.

### 5.8 Order Dashboard And Triage

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Active and archive views | The default queue contains `waiting_info` through `preparing`; `shipped` and `cancelled` orders live in a separate archive. | Keeps finished work out of the daily queue without making it difficult to retrieve. |
| Active-order count | The active tab shows the total number of in-progress orders regardless of how many pages are loaded. | Gives the operator an immediate sense of remaining work. |
| Progressive order list | Results load 20 at a time with an action to show more matching orders. | Supports growing order histories without loading the entire shop queue at once. |
| At-a-glance order data | Detailed active cards show code, product summary, customer or missing-information state, amount, status, age, delivery timing, receipt state, and tracking state. Archive and search results use a more compact summary. | Lets the operator triage active work while keeping broader lookup results scannable. |
| Unified search | Searches customer name, normalized mobile, numeric order code, or Instagram username across active and archived orders. | Matches the fragments an operator is likely to remember from a DM or support request. |
| Status filters | The active and archive views offer their relevant statuses; searching exposes all six status filters. | Answers the main operational question without mixing completed work into the default queue. |
| Delivery urgency | Active cards label overdue and near-term delivery dates. There is no separate due-soon filter. | Surfaces fulfillment risk directly in the queue without another filtering mode. |
| Sorting | Active orders default to nearest delivery; archive and search default to latest update. Newest order and highest amount are also available where relevant. | Prioritizes operational urgency in active work and recent activity during lookup. |
| URL-preserved view | Search, filters, and sort are represented in the URL and retained when returning from an order. | Lets operators inspect an order without losing their working queue. |
| Clear empty and error states | Distinguishes no orders from no matching results and supports retrying failed loads. | Keeps the operator oriented and provides a direct recovery path. |

### 5.9 Admin Order Record And Fulfillment

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Complete operational record | Shows shop, products, quantities, unit prices, total, delivery date, Instagram username, internal note, full customer details, receipt, tracking code, timestamps, link, and history. | Makes the order page the primary record so the operator does not need to reconstruct it from DMs. |
| Protected receipt preview | Initial and final receipt images are available only to authenticated admins assigned to the order's shop and are not browser-cached. | Keeps payment evidence out of the public link and limits cross-shop exposure. |
| Split-payment controls | The record shows both amounts and receipts, requests the final payment, copies its DM, and records explicit confirmation. Shipping remains possible before confirmation but requires an operator warning. | Keeps payment progress beside fulfillment while preserving an emergency manual override. |
| Customer-detail correction | After the customer submits, the operator can correct name, mobile, address, postal code, and customer note. | Handles typos and support corrections without asking the customer to resubmit everything. |
| Internal-context correction | The operator can edit the Instagram username and internal note after creation. | Keeps the link to the original conversation and private operating context accurate. |
| Delivery-date correction | The operator may replace the estimated delivery date with a current or future date. | Supports fulfillment changes while keeping customer expectations synchronized. |
| Manual status update | The operator can select and save any of the six statuses. | Keeps the pilot workflow fast and flexible without building a customizable workflow engine. |
| Status history | Every real status change records its previous state, new state, time, and admin when applicable. | Provides basic accountability and explains how the order reached its current state. |
| Manual tracking code | The operator can add, clear, view, and copy a shipment tracking code. | Delivers the most useful post-shipment information without a courier integration. |
| Copy actions | Mobile, address, customer link, and tracking code can be copied from the record. | Supports handoff to calling, mapping, Instagram, and shipping workflows outside Radif. |

The operator cannot currently edit products, quantities, total amount, shop, or
receipt after creation or import.

### 5.10 Statuses, History, And Expiry

| Status | Product meaning |
| --- | --- |
| `waiting_info` | The order exists, but the customer has not submitted details and a receipt. |
| `waiting_payment` | Customer details and a receipt exist, and the shop must verify payment manually. |
| `paid` | The shop has manually accepted the payment; for a split order this confirms the first payment. |
| `preparing` | Fulfillment work is in progress. |
| `shipped` | The order has been dispatched. |
| `cancelled` | The order is no longer active. |

Current transition rules:

- A new order starts at `waiting_info`.
- Customer submission changes `waiting_info` to `waiting_payment`.
- Historical import starts in any status except `waiting_info`, requires a
  receipt for `waiting_payment`, and records its status as the initial history
  entry.
- Only an operator can decide that an order is `paid`.
- Final-payment request, receipt, and confirmation are parallel payment state;
  they do not add or change fulfillment statuses.
- Operators may move directly between statuses except that submitted orders
  cannot return to `waiting_info`, and receipt-less orders cannot enter
  `waiting_payment`.
- Re-saving the same status does not create duplicate history.
- Orders created at least 48 hours ago and currently in `waiting_info` are
  cancelled automatically at startup or during an hourly cleanup. An old order
  moved back to `waiting_info` can therefore be cancelled by the next cleanup.
- Automatic cancellation creates a history entry and does not affect orders in
  any later state.
- A tracking code may currently be added in any status.

Automatic cancellation keeps abandoned forms out of the active queue. The
flexible admin transition rule is a deliberate MVP simplification, not a
validated ideal workflow.

### 5.11 Customer Status And Tracking

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Submission confirmation | The successful form is replaced by a registered-order state. | Reassures the customer that the details and receipt reached the shop. |
| Current public status | Shows a customer-friendly Persian status and latest update. | Answers the most common progress question without requiring a DM. |
| Public timeline | After submission, shows status changes in chronological order without admin identity. | Provides transparent progress while keeping internal staff information private. |
| Receipt state | States whether each requested receipt was uploaded or confirmed but never displays an image publicly. | Reassures the customer while protecting payment evidence and accurately representing receipt-less historical imports. |
| Masked customer summary | Shows full name, partially masked mobile, shortened address, and only the last four postal-code digits. | Helps the customer recognize the submitted record while reducing exposure through a forwarded link. |
| Tracking code | Displays and copies the operator-entered code when present. | Lets the same link answer post-shipment tracking questions. |
| Shop support action | When configured, the public page can open the shop's Instagram or WhatsApp with the order code in a prepared message. Before submission it offers general help; afterward it offers an information-correction request. | Gives blocked customers a recovery path without making the one-time form editable. |

### 5.12 Persian, Mobile, Installable, And Accessible Experience

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Persian-only interface | User-facing copy, errors, labels, numbers, dates, and statuses are designed for Persian speakers. | Matches the initial market instead of adding unused localization complexity. |
| Full RTL layout | The page direction, forms, cards, and navigation follow right-to-left reading. Technical values use LTR where necessary. | Makes the product natural to read while keeping URLs, mobile numbers, card numbers, and tracking codes usable. |
| Mobile-first operations | Admin and customer screens use a centered content width of roughly 480px even on desktop. | Optimizes for phones and Instagram's in-app browser rather than building separate desktop behavior. |
| Installable operator app | Supported browsers can install the authenticated interface to the home screen for standalone launch; iOS users receive Safari instructions. The service worker does not cache application data, so network access is still required. | Gives frequent operators app-like access without maintaining a native application or implying offline support. |
| Persian-aware dates and digits | Native locale formatting is used, and common Persian/Arabic numeric input is normalized. | Reduces cognitive and input friction for Iranian users. |
| Touch and keyboard basics | Large controls, semantic labels, visible focus, inline alerts, live states, and reduced-motion support are present. | Keeps the core journey usable across phones, keyboards, and assistive technology without a separate UI mode. |

## 6. Product Rules Future Work Must Preserve

These rules protect the current product promise and should not be changed
accidentally during feature work:

1. Radif starts after a sale is confirmed; it does not currently replace the
   Instagram selling conversation.
2. Order creation must stay faster than the manual workflow it replaces.
3. Every order creation request uses retry protection so network uncertainty
   cannot silently create duplicates.
4. The customer must not need an account, password, app, SMS, or email.
5. Each customer link represents one order and exposes only public order data.
6. In the live customer-submission flow, customer details and exactly one valid
   initial receipt are committed together. A requested split-payment remainder
   may later receive exactly one final receipt. Operator-only historical import
   may omit the receipt, but a receipt-less order cannot use `waiting_payment`.
7. Customer receipt upload means "waiting for payment review," not "paid."
8. Customer submission is one-time; only an authorized shop operator can make
   later corrections.
9. Full mobile, full address, full postal code, receipts, internal notes,
   customer Instagram usernames, and admin identity must never appear in public
   order responses. The current public summary intentionally includes the
   customer's full name, and configured support may expose the shop's Instagram
   username.
10. Every admin order and receipt action remains scoped to an assigned shop.
11. Product images may be public, but receipts must remain protected.
12. The UI remains Persian, RTL, mobile-first, and usable at roughly 320-480px.
13. PostgreSQL, receipts, and product images form one operational data set and
    must be backed up and restored together.

## 7. Important Data Behaviors

- Money is stored and shown as positive integer toman amounts.
- Each order item snapshots its unit price at creation.
- The order's total can intentionally differ from the sum of item prices.
- Each order snapshots the active payment card number and instructions, so
  changing shop payment settings affects only future orders.
- Product names and images are not snapshotted. Editing a product changes how
  that product appears in old orders, but does not change old unit prices.
- Customer links are high-entropy secrets but are currently stored so the admin
  can retrieve and copy them again.
- Public links do not expire or support disable-only revocation, but an operator
  can rotate a leaked link and issue a replacement.
- Customer records and receipts currently have no automatic deletion policy.
- Uploaded product images live on public URLs; uploaded receipts live behind
  authenticated, shop-scoped access.

## 8. Security And Trust Baseline

Security is part of the product because Radif stores addresses, mobile numbers,
and payment evidence.

Current protections include:

- Hashed admin passwords and opaque database-backed sessions.
- HTTP-only, same-site cookies with secure-cookie support for HTTPS.
- Login failure throttling.
- Exact-origin checks on state-changing requests.
- Authentication and shop assignment checks on private records and receipts.
- High-entropy customer links and generated upload filenames.
- File size and actual image-type validation.
- Public responses that omit full customer details and internal operations data.
- Baseline browser security headers and non-cached receipt responses.
- Database constraints and transactional writes for critical order operations.

The current trust limits are equally important:

- A forwarded customer link grants access to that order's public data until an
  operator rotates it.
- The public response includes the customer's full name after submission.
- Links have no expiry or disable action; rotation is the emergency recovery
  control.
- There is no MFA, password recovery, session-management screen, audit log,
  application-level field encryption, or customer deletion workflow.
- Login throttling and uploaded files assume a small, single-instance pilot.

## 9. Operational Capabilities

- The Go application serves the API and compiled React application as one
  deployable process.
- PostgreSQL stores structured product and order data.
- Product images and receipts use persistent local storage.
- Database migrations run automatically at startup.
- A public health endpoint verifies database connectivity.
- Production deployment supports TLS through Caddy, persistent volumes,
  graceful shutdown, and a non-root application container.
- A nightly same-host job coordinates PostgreSQL dumps with append-only receipt
  and product-image backups; deployment documentation also covers manual
  off-site download and restore procedures.
- Admin accounts are created or reset with a seed command.
- Shop creation, name/logo branding, activation, and admin-shop assignments
  currently require direct database provisioning outside the product UI. The
  deployment runbook contains current multi-admin provisioning SQL. Assigned
  operators manage payment cards, support contacts, and sharing-message settings
  from the Account screen.

These choices keep the pilot inexpensive and understandable, but they are not
a horizontally scalable SaaS architecture.

## 10. Current Product Boundaries

The following capabilities do not exist today. Future AI discussions must not
describe them as partially shipped.

### Selling And Catalog

- No public storefront, product browsing, customer cart, or checkout.
- No direct Instagram API, DM ingestion, chatbot, or automatic message sending.
- No inventory, stock reservation, variants, SKU system, categories, bundles,
  discounts, coupons, or product galleries.
- No ad-hoc order line item that is not already an active product.

These are excluded because Radif currently organizes a sale after agreement;
it does not create or automate the sale.

### Accounts And Shops

- No public registration or self-service trial activation.
- No admin invitation, role, permission, team, password-change, or recovery UI.
- No shop creation, name/logo branding, activation, or assignment UI. Payment
  cards, support contacts, and sharing-message text are operator-managed.
- No billing, subscription, or organization model.

These remain manual so the pilot can validate workflow value before investing
in SaaS onboarding and account administration.

### Payments And Customer Changes

- No online payment gateway, bank integration, receipt OCR, fraud detection,
  transaction matching, refunds, or automatic payment confirmation.
- No customer edit or receipt replacement after submission.
- No customer account or history across multiple orders.

Payment acceptance remains a human decision because a screenshot alone is not
reliable proof and no financial integration exists.

### Fulfillment And Communication

- No SMS, email, Telegram, push notification, or reminder system.
- No courier integration, shipping label, tracking lookup, or delivery event.
- No staff assignment, comments, SLA alerts, or bulk operations.
- No enforced status transition sequence or customizable workflow.

The current product records and exposes progress but does not automate external
fulfillment systems.

### Reporting And Data Governance

- No analytics dashboard, accounting report, financial reconciliation, or
  order export.
- No data retention controls, customer deletion, or media quota.
- No automated off-site backup or backup-failure alerting.

## 11. Known Gaps And Product Risks

These are not automatically the next roadmap. They are constraints an AI or
product discussion should account for.

| Gap or risk | Why it matters |
| --- | --- |
| Pilot measurement is incomplete | Successful normal creation records `order_create_started` retrospectively from client-reported elapsed time plus `order_created`; it does not observe abandoned or failed starts. Successful clipboard copies from the post-create screen record `order_link_copied`, while native-share success, historical imports, and later order-detail copies do not. Public support clicks record channel and action type, but link opens, form completion, status views, status changes, and CSV export remain absent. |
| Shop onboarding is manual | Every new pilot shop still needs technical database/operator work before it can use the product, although the deployment runbook now contains current provisioning SQL. |
| Customer links live indefinitely | Links do not expire or support disable-only revocation; a leaked link remains usable until an operator rotates it. |
| Customer data has indefinite retention | Addresses, mobile numbers, and receipts accumulate without deletion controls or a documented product retention policy. |
| Status transitions remain flexible | Flexibility is fast, but an operator can still skip payment review, move shipped orders backward, or create unusual histories outside the two enforced information and receipt prerequisites. |
| Historical product display can change | Renaming or replacing a product image changes old order presentation because only unit price is snapshotted. |
| Customer submission is irreversible | Mistakes require operator intervention; the customer cannot replace a wrong receipt or address. |
| Local media and in-memory throttling limit scaling | Multiple application instances would require shared media storage and coordinated rate limiting. |
| Frontend verification is manual | There are no automated React, browser, narrow-screen, RTL, or accessibility tests. |

## 12. Product Hypotheses And Success Signals

The MVP exists to test these hypotheses, not simply to accumulate features:

1. A shop will register most confirmed Instagram sales if order creation and
   customer handoff take less than 30 seconds.
2. Customers will complete a short account-free form from an Instagram link
   without needing operator assistance.
3. Keeping address, receipt, products, and status together will nearly eliminate
   lost information for orders registered in Radif.
4. Delivery-based triage and status filtering will make Radif the operator's
   primary order lookup tool instead of Instagram DMs.
5. A reusable customer status link will reduce repetitive progress questions.
6. At least one pilot shop will value the workflow enough to pay for continued
   use.

Original pilot targets were:

- At least 80% of confirmed sales entered into Radif.
- Median order creation time below 30 seconds.
- At least 70% customer form completion without assistance.
- Near-zero lost information for registered orders.
- Admin usage on at least four days per week.
- The dashboard becoming the primary order lookup tool.
- At least one shop willing to pay for another month.

These are product targets, not current measured results. The current event set
cannot calculate all of them; interviews and additional instrumentation are
required.

## 13. Questions For Deciding What To Build Next

Future planning should begin with evidence from real orders and interviews,
then identify the smallest change that removes the most important failure in
the core workflow.

### Adoption

- Are confirmed sales consistently entered into Radif? If not, at which step
  does the operator return to DMs or notes?
- Is create-and-send or share actually below 30 seconds on the operator's phone?
- Does manual shop setup prevent meaningful pilot growth?

### Customer Completion

- What percentage of opened links lead to a valid submission?
- Where do customers abandon or ask for help: payment instructions, address,
  receipt selection, trust, or connection failure?
- How often do customers submit the wrong details or receipt and need a repair
  path?

### Daily Operations

- Does the dashboard become the first place operators look for an order?
- Which mistakes or delays still force them back into Instagram conversations?
- At what order volume do assignment, reminders, or stricter status
  rules become necessary?

### Trust And Privacy

- Are permanent bearer links acceptable to shops and customers?
- What retention period is appropriate for addresses and receipts?
- Do shops need customer-link revocation, receipt replacement, audit history,
  or stronger admin authentication before wider use?

### Growth And Revenue

- Is the next bottleneck proving value, onboarding more shops, team
  collaboration, customer communication, or external integration?
- Which capability would a pilot shop actually pay for now?
- Can a proposed feature be validated manually before making the product more
  complex?

## 14. AI Handoff Instructions

When using this document with an AI for product planning, provide the specific
evidence available from pilot usage and ask it to preserve the product rules in
section 6.

A useful starting prompt is:

```text
You are helping plan Radif, a Persian mobile-first operational tool for small
Instagram shops. Treat PRODUCT.md as the current product source of truth.

Do not assume that an absent feature is already planned or necessary. Start
from the post-DM order workflow, the under-30-second creation constraint,
customer completion, shop operations, privacy, and willingness to pay.

For every recommendation:
1. Name the observed user problem or evidence it addresses.
2. Identify the affected user and workflow step.
3. Explain why the current product is insufficient.
4. Propose the smallest test or product change that could validate the idea.
5. State which current product rule, risk, or metric it affects.
6. Separate must-have pilot work from later scaling work.

Here is the new evidence or question I want to discuss:
[INSERT EVIDENCE OR QUESTION]
```

Before selecting a roadmap, prefer collecting missing evidence over building a
speculative system. The product succeeds when it removes operational disorder
without becoming more work than the Instagram workflow it supports.

## 15. Candidate Next Steps

These candidates remain unimplemented and should still be validated against
pilot evidence before becoming a roadmap.