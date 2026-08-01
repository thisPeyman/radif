# Radif Product Context

> Current product truth for product planning and AI conversations.
>
> Last reviewed against the implemented application: 2026-08-01.
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

The key adoption constraint is speed: creating an order and copying its link
should take less than 30 seconds for a repeat workflow. If Radif creates more
work than it removes, operators will return to DMs and notes.

### Customer

The secondary user is a mobile customer opening a link from Instagram's
in-app browser. They need to:

- Recognize the shop and order before sharing personal information.
- See the products, amount, delivery estimate, and payment instructions.
- Submit delivery details and one payment receipt without creating an account.
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
-> operator copies the link back into the DM
-> customer sees the order and card-transfer instructions
-> customer submits delivery details and one receipt together
-> order waits for manual payment confirmation
-> operator reviews the receipt and manages fulfillment
-> customer revisits the same link for status and tracking
```

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
| Account summary and logout | Shows the operator's name, login, accessible-shop count, and a logout action. | Provides identity confirmation and safe session termination without a settings area. |

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
| Estimated delivery date | A required Persian-friendly date is visible to both operator and customer. The UI allows today through roughly two years ahead; the API requires today or later. | Creates a concrete fulfillment expectation and powers urgency-based order triage. |
| Optional Instagram username | The customer's Instagram handle can be attached to the internal order. | Preserves a lightweight link back to the original conversation when needed. |
| Optional internal note | The operator may save private context that is never shown publicly. | Keeps operational exceptions beside the order instead of buried in DMs. |
| Order code | Every created order receives a short visible code based on its record ID. | Gives operators and customers an easy reference that is safer to discuss than a long secret URL. |
| One primary create-and-copy action | Creating the order immediately attempts to copy the customer link. | Optimizes the core handoff back to the Instagram conversation. |
| Clipboard fallback | If automatic copying fails, the success screen keeps the link visible, selectable, and copyable again. | Supports restrictive mobile and in-app browsers without losing the newly created order. |
| Creation retry protection | A browser-held creation key makes identical retries return the same order and rejects reuse with changed data. | Prevents duplicate orders when the network or clipboard flow leaves the operator unsure whether creation succeeded. |
| Pending-navigation protection | Shop switching, bottom navigation, and accidental page exit are blocked or warned about while creation is submitting. | Reduces duplicate or misplaced orders during the most important write operation. |
| Post-create actions | The operator can correct the delivery date, open the order, return to the list, or start another order. | Supports the immediate follow-up tasks without making the creation form longer. |

New orders start in `waiting_info`, meaning Radif is waiting for the customer to
provide delivery details and a receipt.

### 5.5 Secret Customer Order Link

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| One high-entropy link per order | Anyone possessing `/o/:token` can open that order's public experience without an account. | Removes registration, password, SMS, and installation friction from a one-time purchase workflow. |
| Order-specific context | The link shows shop identity, products, quantities, total, delivery estimate, current status, and payment instructions. | Builds trust and prevents the customer from submitting information to an ambiguous generic form. |
| Reusable status destination | The same link changes from an information form into a status page after submission. | Gives the customer one durable place to check progress and reduces support messages. |
| Continued access | The link currently has no expiry and continues to work after completion or cancellation. | Keeps the pilot experience simple and ensures old customers can revisit their status, at the cost of long-lived-link privacy risk. |

The token is a bearer secret. It should be treated like access to that order and
must not be exposed in public analytics, logs, screenshots, or support material.

### 5.6 Payment Instructions And Customer Submission

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Shop payment details | The public order shows the shop's card number and supporting payment instructions. The card number can be copied. | Fits the card-to-card payment habit used by the initial market without integrating a payment gateway. |
| One-page Persian form | Collects required full name, Iranian mobile, full address, and one receipt; postal code and customer note are optional. | Keeps the task short enough for Instagram's mobile browser and asks only for fulfillment data. |
| Iranian number normalization | Persian, Arabic, and Latin digits are accepted; common `+98`, `0098`, and `98` mobile formats become `09xxxxxxxxx`. | Lets customers enter familiar formats while storing consistent data for operations. |
| Local text draft recovery | Customer text fields are stored under that order token and restored after refresh or recoverable failure. | Protects customers from retyping long addresses on unreliable mobile connections. |
| Receipt preview | A selected image can be previewed, replaced, or removed before submission. | Helps the customer catch the wrong screenshot before the one-time submission. |
| Atomic submission | Customer details and exactly one receipt are accepted together or not at all. | Prevents incomplete operational records where an address exists without payment evidence or vice versa. |
| Validated receipt | The server accepts one non-empty JPEG, PNG, or WebP file within the configured size limit and detects its type from its opening bytes rather than its filename. It does not fully decode the image. | Rejects obvious unsupported uploads and filename spoofing while keeping the pilot upload flow small. |
| One-time customer submission | Submission is allowed only once and only while the order is waiting for information. | Avoids conflicting customer edits after the shop begins payment review and fulfillment. |
| Manual payment distinction | A submitted receipt moves the order to `waiting_payment`, never directly to `paid`. | Avoids falsely claiming payment success when Radif cannot verify bank transactions. |

The customer is explicitly told that uploading a receipt does not confirm
payment. The shop operator remains responsible for checking it.

### 5.7 Order Dashboard And Triage

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Shop order list | Shows up to 100 orders for the active shop as compact mobile cards. | Replaces DM search with one understandable operational queue while keeping the pilot interface simple. |
| At-a-glance order data | Cards show code, product summary, customer or missing-information state, amount, status, age, delivery date, receipt state, and tracking state. | Lets the operator decide what needs attention without opening every order. |
| Unified search | Searches customer name, normalized mobile, numeric order code, or Instagram username. | Matches the fragments an operator is likely to remember from a DM or support request. |
| Status filters | Filters by waiting for information, waiting for payment, paid, preparing, shipped, or cancelled. | Answers the main operational question: where is each order in fulfillment? |
| Due-soon filter | Shows active orders due within seven days, including overdue orders. | Surfaces fulfillment risk before a promised date is missed. |
| Sorting | Supports nearest delivery, newest, or highest amount; nearest active delivery is the default. | Prioritizes operational urgency while still supporting recent-order lookup and value-based review. |
| URL-preserved view | Search, filters, and sort are represented in the URL and retained when returning from an order. | Lets operators inspect an order without losing their working queue. |
| Clear empty and error states | Distinguishes no orders from no matching results and supports retrying failed loads. | Keeps the operator oriented and provides a direct recovery path. |

### 5.8 Admin Order Record And Fulfillment

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Complete operational record | Shows shop, products, quantities, unit prices, total, delivery date, Instagram username, internal note, full customer details, receipt, tracking code, timestamps, link, and history. | Makes the order page the primary record so the operator does not need to reconstruct it from DMs. |
| Protected receipt preview | Receipt images are available only to authenticated admins assigned to the order's shop and are not browser-cached. | Keeps payment evidence out of the public link and limits cross-shop exposure. |
| Customer-detail correction | After the customer submits, the operator can correct name, mobile, address, postal code, and customer note. | Handles typos and support corrections without asking the customer to resubmit everything. |
| Delivery-date correction | The operator may replace the estimated delivery date with a current or future date. | Supports fulfillment changes while keeping customer expectations synchronized. |
| Manual status update | The operator can select and save any of the six statuses. | Keeps the pilot workflow fast and flexible without building a customizable workflow engine. |
| Status history | Every real status change records its previous state, new state, time, and admin when applicable. | Provides basic accountability and explains how the order reached its current state. |
| Manual tracking code | The operator can add, clear, view, and copy a shipment tracking code. | Delivers the most useful post-shipment information without a courier integration. |
| Copy actions | Mobile, address, customer link, and tracking code can be copied from the record. | Supports handoff to calling, mapping, Instagram, and shipping workflows outside Radif. |

The operator cannot currently edit products, quantities, total amount, shop,
Instagram username, or internal note after creation, and cannot replace the
receipt.

### 5.9 Statuses, History, And Expiry

| Status | Product meaning |
| --- | --- |
| `waiting_info` | The order exists, but the customer has not submitted details and a receipt. |
| `waiting_payment` | Details and receipt exist; the shop must verify payment manually. |
| `paid` | The shop has manually accepted the payment. |
| `preparing` | Fulfillment work is in progress. |
| `shipped` | The order has been dispatched. |
| `cancelled` | The order is no longer active. |

Current transition rules:

- A new order starts at `waiting_info`.
- Customer submission changes `waiting_info` to `waiting_payment`.
- Only an operator can decide that an order is `paid`.
- Operators may currently move directly between any statuses, including moving
  backward or restoring a cancelled order.
- Re-saving the same status does not create duplicate history.
- Orders created at least seven days ago and currently in `waiting_info` are
  cancelled automatically at startup or during an hourly cleanup. An old order
  moved back to `waiting_info` can therefore be cancelled by the next cleanup.
- Automatic cancellation creates a history entry and does not affect orders in
  any later state.
- A tracking code may currently be added in any status.

Automatic cancellation keeps abandoned forms out of the active queue. The
flexible admin transition rule is a deliberate MVP simplification, not a
validated ideal workflow.

### 5.10 Customer Status And Tracking

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Submission confirmation | The successful form is replaced by a registered-order state. | Reassures the customer that the details and receipt reached the shop. |
| Current public status | Shows a customer-friendly Persian status and latest update. | Answers the most common progress question without requiring a DM. |
| Public timeline | After submission, shows status changes in chronological order without admin identity. | Provides transparent progress while keeping internal staff information private. |
| Receipt state | Confirms that a receipt was uploaded but does not display it publicly. | Reassures the customer while protecting payment evidence. |
| Masked customer summary | Shows full name, partially masked mobile, shortened address, and only the last four postal-code digits. | Helps the customer recognize the submitted record while reducing exposure through a forwarded link. |
| Tracking code | Displays and copies the operator-entered code when present. | Lets the same link answer post-shipment tracking questions. |

### 5.11 Persian, Mobile, And Accessible Experience

| Feature | Current behavior | Product reason |
| --- | --- | --- |
| Persian-only interface | User-facing copy, errors, labels, numbers, dates, and statuses are designed for Persian speakers. | Matches the initial market instead of adding unused localization complexity. |
| Full RTL layout | The page direction, forms, cards, and navigation follow right-to-left reading. Technical values use LTR where necessary. | Makes the product natural to read while keeping URLs, mobile numbers, card numbers, and tracking codes usable. |
| Mobile-first operations | Admin and customer screens use a centered content width of roughly 480px even on desktop. | Optimizes for phones and Instagram's in-app browser rather than building separate desktop behavior. |
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
6. Customer details and exactly one valid receipt are committed together.
7. Receipt upload means "waiting for payment review," not "paid."
8. Customer submission is one-time; only an authorized shop operator can make
   later corrections.
9. Full mobile, full address, full postal code, receipts, internal notes,
   Instagram usernames, and admin identity must never appear in public order
   responses. The current public summary intentionally includes the customer's
   full name.
10. Every admin order and receipt action remains scoped to an assigned shop.
11. Product images may be public, but receipts must remain protected.
12. The UI remains Persian, RTL, mobile-first, and usable at roughly 320-480px.
13. PostgreSQL, receipts, and product images form one operational data set and
    must be backed up and restored together.

## 7. Important Data Behaviors

- Money is stored and shown as positive integer toman amounts.
- Each order item snapshots its unit price at creation.
- The order's total can intentionally differ from the sum of item prices.
- Product names and images are not snapshotted. Editing a product changes how
  that product appears in old orders, but does not change old unit prices.
- Customer links are high-entropy secrets but are currently stored so the admin
  can retrieve and copy them again.
- Public links do not expire and cannot currently be revoked or rotated.
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

- A forwarded customer link grants access to that order's public data.
- The public response includes the customer's full name after submission.
- Links have no expiry, revoke, or rotate action.
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
- Deployment documentation includes coordinated database/media backup and
  restore procedures.
- Admin accounts are created or reset with a seed command.
- Shops, payment details, logos, and admin-shop assignments currently require
  direct database provisioning outside the product UI. The checked-in
  deployment runbook still describes the removed single-owner schema and must
  be corrected before it can be used for this task.

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
- No shop creation, editing, branding, payment-settings, or assignment UI.
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
- No pagination beyond the current 100-order list cap.
- No data retention controls, customer deletion, or media quota.
- No automated off-site backup or backup-failure alerting.

## 11. Known Gaps And Product Risks

These are not automatically the next roadmap. They are constraints an AI or
product discussion should account for.

| Gap or risk | Why it matters |
| --- | --- |
| Pilot measurement is incomplete | Successful creation records `order_create_started` retrospectively from client-reported elapsed time plus `order_created`; it does not observe abandoned or failed starts. Successful copy from the post-create screen records `order_link_copied`, but later copies from order details do not. Link opens, form completion, status views, status changes, and CSV export are absent, so core adoption hypotheses cannot yet be measured reliably. |
| Shop onboarding is manual | Every new pilot shop needs technical database/operator work before it can use the product, and the current deployment runbook's provisioning SQL is outdated. |
| Customer links live indefinitely | A leaked or forwarded link remains usable and there is no operator recovery action. |
| Customer data has indefinite retention | Addresses, mobile numbers, and receipts accumulate without deletion controls or a documented product retention policy. |
| Statuses are unrestricted | Flexibility is fast, but an operator can skip payment review, move shipped orders backward, or create inconsistent histories. |
| Historical product display can change | Renaming or replacing a product image changes old order presentation because only unit price is snapshotted. |
| Customer submission is irreversible | Mistakes require operator intervention; the customer cannot replace a wrong receipt or address. |
| Order list is capped at 100 | Pilot volumes are supported, but older matching orders become unavailable as a shop grows. |
| Local media and in-memory throttling limit scaling | Multiple application instances would require shared media storage and coordinated rate limiting. |
| Frontend verification is manual | There are no automated React, browser, narrow-screen, RTL, or accessibility tests. |
| Public support path is missing | A blocked customer is told to contact the shop, but the public order does not provide a shop contact action. |

## 12. Product Hypotheses And Success Signals

The MVP exists to test these hypotheses, not simply to accumulate features:

1. A shop will register most confirmed Instagram sales if order creation and
   link copying take less than 30 seconds.
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
- Is create-and-copy actually below 30 seconds on the operator's phone?
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
- At what order volume do pagination, assignment, reminders, or stricter status
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




<!-- Next steps -->

3. Optimize the create-and-send handoff without integrating Instagram

Observed problem or evidence: Order creation speed is Radif’s primary adoption constraint. The existing copy behavior is thoughtful, but actual creation time and copy failures are not properly observed.

Affected user and workflow step: Shop operator, from confirmed sale to sending the order link in the Instagram conversation.

Why the current product is insufficient: Automatic copying may fail in mobile or in-app browsers. Even when it works, the operator still switches to Instagram, finds the conversation and writes an explanatory message. Radif does not know how often this causes delay or abandonment.

Smallest test or change:

Add a “Create and share” action using the phone’s native share sheet, while retaining copy fallback.
Generate a ready-to-send Persian message containing the shop name, order code, purpose of the link and the link itself.
Only add optimizations such as recent-products-first, duplicate-last-order or saved quantities when the recordings show those exact bottlenecks.

This captures much of the benefit of Instagram integration without API work.

Rule, risk or metric affected: Product rules 1–3, under-30-second creation, retry safety, capture rate and the requirement not to disrupt conversational selling.

Stage: Must-have now.


4. Give blocked customers a recovery path

Observed problem or evidence: The current public experience has no direct shop-contact action. Customer submission is one-time, so a wrong address or receipt requires operator intervention.

Affected user and workflow step: Customer during form completion and immediately after submitting.

Why the current product is insufficient: When something goes wrong, the customer must manually return to Instagram, locate the shop and explain the order. Some customers may abandon instead.

Smallest test or change: Add two actions:

Before submission: “پیام به فروشگاه”, opening the shop’s Instagram or WhatsApp contact with the order code.
After submission: “درخواست اصلاح اطلاعات”, opening a prepared message such as “برای سفارش ۱۲۳ نیاز به اصلاح اطلاعات دارم.”

Track clicks and ask operators what customers needed help with. Do not build customer self-editing yet. First learn whether mistakes concern address, receipt, payment instructions, trust or connectivity.

Rule, risk or metric affected: Customer completion, unassisted completion, the missing public-support-path risk, one-time submission and account-free access.

Stage: Must-have now. Self-service editing is later work only if correction frequency is meaningful.



5. Add minimum recovery controls for customer links

Observed problem or evidence: Customer links are permanent bearer secrets. A forwarded or leaked link cannot be revoked, and the public response continues to reveal order information indefinitely.

Affected user and workflow step: Shop operator and customer after a link is accidentally shared, an order is cancelled or an old order should no longer remain publicly accessible.

Why the current product is insufficient: The operator currently has no recovery action. This can become a serious trust objection when asking shops to pay or when expanding beyond friendly pilots.

Smallest test or change:

Add Rotate customer link.
Add Disable public link.
Record both actions in order history.
Ensure the previous token immediately stops working.
Write a clear pilot retention policy covering addresses and receipts, even before implementing automatic deletion.

Do not build a sophisticated retention engine yet. First establish a policy and an emergency recovery capability.

Rule, risk or metric affected: Public-data rule, bearer-link risk, indefinite-retention risk, status-link trust, backup coordination and public omission of private data.

Stage: Must-have before expanding materially beyond the two pilots.


8. Add customer notifications only after testing operator behavior

Observed problem or evidence: The reusable status link can reduce support questions, but it does not proactively tell customers that payment was accepted or an order shipped.

Affected user and workflow step: Operator changing status and customer waiting for progress.

Why the current product is insufficient: Customers may not revisit the link unless the shop reminds them. Operators may continue manually typing repetitive status messages.

Smallest test or change: On each important status change, show a prepared Persian message and a native share button. Measure:

How often operators share it.
Which statuses they share.
Whether status-question DMs decrease.
Whether customers open the link afterward.

Only then choose between SMS, WhatsApp or Instagram messaging.

Rule, risk or metric affected: Reduction in repetitive status questions, reusable-status-link hypothesis and customer-link privacy.

Stage: Pilot experiment first; external notification integration later.