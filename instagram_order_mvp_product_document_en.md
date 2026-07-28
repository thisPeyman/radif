# MVP Product Document  
## Order Management for Instagram-Based Shops in Iran

> **Document language:** English  
> **Product language:** Persian (Farsi), with full right-to-left support  
> **Product stage:** MVP / Pilot  
> **Primary market:** Instagram-based shops in Iran  
> **Initial category:** Small product-based shops, especially home decor and lampshade sellers  

---

## 1. Product Summary

This MVP helps Instagram shop admins turn a confirmed Direct Message sale into a structured, trackable order.

The product does not replace Instagram Direct Messages and does not attempt to become a full online store, CRM, chatbot, or inventory system.

Instead, it focuses on one operational problem:

> After a customer agrees to buy in Instagram DMs, the admin needs a fast way to create an order, collect the customer’s delivery details, track the order status, and avoid losing information inside the conversation.

The admin creates a lightweight order, sends a unique link to the customer, and the customer completes their information through a simple Persian mobile form. The order then appears in a structured dashboard where the admin can track it until shipment.

---

## 2. Product Language and Localization

Although this document is written in English, the product itself must be built for Persian-speaking users.

The MVP must be:

- Fully in Persian
- Right-to-left
- Mobile-first
- Clear and simple for non-technical shop admins
- Optimized for customers opening links inside Instagram’s in-app browser
- Designed around Iranian addresses, mobile numbers, payment habits, and delivery expectations
- Written in friendly, direct Persian rather than formal or technical language

English should not appear in the primary user experience unless required for technical or brand reasons.

Dates, numbers, labels, buttons, errors, and status names should all be understandable to Persian-speaking users.

---

## 3. Product Vision

Help small Instagram shops manage confirmed orders without forcing them to build a website, use a complex CRM, or fully automate their Instagram account.

The long-term vision is to become the simplest operational layer between Instagram conversations and order fulfillment.

The MVP, however, is intentionally narrow.

It only solves the handoff from:

```text
Customer agrees to buy in Instagram DM
→ Admin creates an order
→ Customer completes delivery details
→ Admin tracks order status
→ Customer checks order progress
```

---

## 4. Target Customer

### Primary User

An Instagram shop admin who:

- Handles orders manually through DMs
- Sells products with mostly fixed prices
- Uses card-to-card payment or another manual payment method
- Stores customer information inside chat messages
- Tracks order progress mentally or through notes
- Manages one or more small Instagram pages
- Sometimes forgets an order, loses an address, or has difficulty finding a receipt
- Receives repeated status questions from customers
- Needs a simple tool rather than a complete e-commerce platform

### Initial Market Segment

The first pilot segment is:

- Lampshade sellers
- Home decor shops
- Small physical-product pages
- Shops with limited product variation
- Shops where human conversation is still important before purchase

### Secondary User

The customer who purchases from the Instagram shop.

The customer:

- Uses a mobile phone
- Opens the order link from Instagram DMs
- Does not want to create an account
- Expects a short and trustworthy form
- Wants confirmation that the order was registered
- May want to check shipment status later

---

## 5. Core Problem

In the current workflow, Instagram DMs are used for too many purposes at once:

- Product questions
- Price discussion
- Customer details
- Address collection
- Payment receipt
- Order confirmation
- Fulfillment tracking
- Customer support

This creates several problems:

- Addresses become difficult to find
- Paid orders may be forgotten
- Receipts become separated from order details
- Admins cannot quickly see which orders are pending, paid, preparing, or shipped
- Customers repeatedly ask for updates
- One admin managing multiple pages experiences more confusion
- Busy periods create stress and operational mistakes

The product must reduce this operational disorder without changing the shop’s sales style.

---

## 6. Core Product Promise

> Keep selling through Instagram DMs. Organize the order after the customer decides to buy.

A successful MVP should make the admin feel:

- “I know exactly which orders are active.”
- “I do not need to search through DMs for the address.”
- “I can see what is paid, preparing, or shipped.”
- “The customer can check the order status without messaging me again.”
- “Creating an order is fast enough that I actually use it every time.”

---

## 7. Main Product Principle

The product must not create more work than it removes.

The most important product requirement is:

> The admin should be able to create and copy an order link in less than 30 seconds.

Ideally, the action should take less than 15 seconds for repeat orders.

If creating an order feels slow, complicated, or repetitive, the admin will return to using DMs only.

---

## 8. Primary User Flow

### Admin Flow

1. The customer agrees to buy in Instagram DMs.
2. The admin opens the product dashboard.
3. The admin selects the relevant shop.
4. The admin selects the product.
5. The admin confirms or edits the order amount.
6. The admin creates the order.
7. The system generates a unique customer link.
8. The admin copies the link and sends it in the Instagram conversation.
9. The customer completes the information form.
10. The order becomes complete in the admin dashboard.
11. The admin changes the order status as fulfillment progresses.
12. The admin adds a tracking code after shipment.
13. The customer checks the status from the same link.

### Customer Flow

1. The customer receives the order link in Instagram DMs.
2. The link opens in Instagram’s mobile browser.
3. The customer sees:
   - Shop name
   - Product image
   - Product name
   - Order amount
4. The customer enters:
   - Full name
   - Mobile number
   - Full delivery address
   - Postal code, if required
   - Optional note
5. The customer selects one payment receipt image.
6. The customer submits the delivery details and receipt together.
7. The customer sees a confirmation screen and order code.
8. The same link becomes the customer’s order status page.
9. After shipment, the customer sees the shipment tracking code.

---

## 9. MVP Features

# 9.1 Admin Login

The admin must be able to access a private dashboard.

The login experience should be simple and should not introduce unnecessary setup.

The MVP only needs to support the basic admin access required for pilot shops.

The product should avoid:

- Complicated roles
- Advanced permissions
- Organization setup
- Long onboarding forms

The goal is to let the admin reach the order screen quickly.

---

# 9.2 Shop Management

The admin can create and access one or more shops.

Each shop should have:

- Shop name
- Optional logo
- Optional short description
- Active products
- Its own orders

This is important because one admin may manage two Instagram pages.

The admin should always know which shop they are currently viewing.

The interface should prevent accidental order creation under the wrong shop.

Advanced branding, custom domains, themes, and shop settings are outside the MVP.

---

# 9.3 Simple Product Management

The admin can create a simple product record.

Each product includes:

- Product name
- One main image
- Default price
- Short description
- Active or inactive status

The product section is not a public storefront.

It only exists to make order creation faster and to show the correct product to the customer.

The MVP should not include:

- Categories
- Inventory
- Multiple image galleries
- Variants
- Complex color management
- Product bundles
- Discounts
- Public browsing
- Searchable catalog
- Shopping cart

If a product has a different price for a specific customer, the admin can edit the amount when creating the order.

---

# 9.4 Fast Order Creation

This is the most important admin feature.

The admin should create an order with the minimum possible input.

Required input:

- Shop
- Product
- Order amount

Optional input:

- Customer’s Instagram username
- Short internal note

The system should then immediately generate:

- A unique order
- A unique customer link
- An initial order status
- A visible order code

The order creation screen should not ask the admin to manually enter the customer’s full address or mobile number.

The customer should complete that information through the link.

The admin must be able to copy the link with one clear action.

The ideal completion flow is:

```text
Select product
→ Confirm amount
→ Create
→ Copy link
```

---

# 9.5 Unique Customer Order Link

Every order must have its own unique link.

The link represents one specific order, not a generic form.

When the customer opens the link, they should immediately understand:

- Which shop sent the link
- Which product the order is for
- How much the order costs
- What information is required
- What will happen after submission

The link should continue working after the form is submitted and become the order tracking page.

The customer should not need:

- An account
- A password
- An app
- An SMS login
- Email verification

The experience must feel lightweight and trustworthy.

---

# 9.6 Customer Information Form

The customer form must be very short and mobile-friendly.

Required fields:

- Full name
- Mobile number
- Full address
- One payment receipt image

Optional or configurable fields:

- Postal code
- Order note

Product and amount should already be attached to the order and should not need to be reselected by the customer.

The form should use:

- Large input fields
- Clear Persian labels
- Simple error messages
- Minimal scrolling
- A clear submit button
- A visible shop identity
- No unnecessary steps

The form must work well inside Instagram’s in-app browser.

The customer should not lose entered information because of a minor connection issue or validation error.

The payment card number must appear in a prominent, left-to-right box separate from supporting payment instructions. Copying it must place only the 16 ASCII digits, without spaces or punctuation, on the clipboard for compatibility with banking applications.

---

# 9.7 Payment Receipt Upload

The customer must upload one screenshot of the card-to-card payment receipt with the delivery details.

The details and receipt are one atomic submission. Neither can be submitted separately or changed by the customer afterward.

The receipt should appear inside the order details for the admin.

The MVP does not verify whether the payment is valid.

The admin remains responsible for payment confirmation.

The product should clearly separate:

- Receipt uploaded
- Payment confirmed

Submitting a receipt must not automatically change the order to “Paid” unless the admin confirms it.

The MVP should not include:

- Receipt OCR
- Bank transaction matching
- Fraud detection
- Automatic payment confirmation
- Financial reporting

---

# 9.8 Order Dashboard

The admin dashboard should show active orders in a structured and understandable format.

The admin should be able to quickly answer:

- Which orders need customer information?
- Which orders are waiting for payment?
- Which orders are paid?
- Which orders are being prepared?
- Which orders have been shipped?
- Which orders need attention?

Each order card or row should show the most useful information at a glance:

- Order code
- Product
- Customer name, when available
- Amount
- Current status
- Order age
- Estimated delivery date and relative urgency
- Shop name, when viewing multiple shops
- Receipt indicator
- Tracking code indicator

The product should prioritize clarity over visual complexity.

The initial dashboard uses a simple card list, ordered by the nearest active delivery by default. The admin can quickly filter active orders that are overdue or due within seven days, filter by status, and sort by nearest delivery, newest order, or highest amount.

The best layout should be chosen based on pilot usability, not visual novelty.

---

# 9.9 Order Status Management

The initial order statuses are:

1. Waiting for customer information
2. Waiting for payment
3. Paid
4. Preparing
5. Shipped
6. Cancelled

Persian labels should be used in the actual product.

The admin must be able to change status quickly.

Status changes should require no more than two taps or clicks.

The order should keep a simple history of status changes so the admin can see what happened and when.

An order still waiting for customer information is automatically cancelled after seven days from creation. This cleanup runs at startup and hourly, records status history, and never applies to receipt-submitted, paid, preparing, or shipped orders. The admin can restore an automatically cancelled order by changing its status.

Advanced workflows and custom status builders are outside the MVP.

---

# 9.10 Order Details Page

Each order should have a clear details page.

The page should show:

- Order code
- Shop
- Product
- Amount
- Customer name
- Customer mobile number
- Customer Instagram username, if entered
- Delivery address
- Postal code
- Customer note
- Admin note
- Payment receipt
- Current status
- Status history
- Shipment tracking code
- Important timestamps

The admin should not need to return to Instagram DMs to find the basic order information.

The order details page becomes the primary operational record for that order.

---

# 9.11 Search and Filtering

The admin should be able to find an order using:

- Customer name
- Mobile number
- Order code
- Instagram username

The admin should also be able to filter by:

- Shop
- Status
- Recent orders

The MVP does not need advanced reporting filters.

Search should solve the practical problem of finding a customer’s order while they are asking for support.

---

# 9.12 Customer Order Status Page

After the customer submits the form, the same link should show the order status.

The customer should see:

- Shop name
- Product
- Order code
- Current status
- Latest update
- Tracking code, if shipped

The status page should reduce repeated messages such as:

- “Was my order registered?”
- “Has my payment been confirmed?”
- “When will it be shipped?”
- “What is my tracking code?”

The page should not expose private internal notes or operational details.

The customer should not be able to see other customers’ orders.

---

# 9.13 Shipment Tracking Code

After shipment, the admin can add a tracking code.

The tracking code should appear on the customer’s status page.

The MVP does not need direct integration with postal or courier services.

The admin manually enters the code.

The product may provide a simple copy button for the tracking code.

---

# 9.14 Optional Telegram Notifications

Telegram is not the main product interface.

It may be used only as an optional notification channel for the admin.

Useful notifications may include:

- Customer submitted delivery details and a receipt
- Order was created
- Order has remained in one status for too long

Notifications should take the admin back to the web dashboard.

The MVP should not attempt to reproduce full order management inside a Telegram bot.

---

## 10. Product Experience Requirements

The MVP should feel:

- Fast
- Lightweight
- Calm
- Trustworthy
- Clear
- Mobile-friendly
- Familiar to Persian-speaking users

The product should avoid:

- Complex menus
- Large dashboards
- Technical terminology
- Too many settings
- Long onboarding
- Hidden actions
- English labels
- Excessive confirmation steps

The most important screens are:

1. Create order
2. Order list
3. Order details
4. Customer form
5. Customer status page

These screens should receive most of the product design attention.

---

## 11. Non-Goals

The MVP is not:

- A full Instagram automation tool
- A chatbot
- A public online store
- A website builder
- An inventory management system
- An accounting product
- A logistics platform
- A CRM
- A content creation tool
- A multi-channel support inbox
- A payment verification system

These may become future opportunities, but none are required to validate the core problem.

---

## 12. Key Product Hypotheses

### Hypothesis 1

Admins will create an order after confirming the sale in Instagram DMs.

### Hypothesis 2

The order creation flow can be completed in less than 30 seconds.

### Hypothesis 3

Customers will open a link sent through Instagram DMs.

### Hypothesis 4

Customers will complete a short Persian form without help.

### Hypothesis 5

Structured orders will reduce lost addresses and forgotten orders.

### Hypothesis 6

A customer status page will reduce repeated follow-up messages.

### Hypothesis 7

At least one pilot shop will pay a monthly subscription after seeing real value.

### Hypothesis 8

The product can provide enough value before direct Instagram integration exists.

---

## 13. Highest-Risk Assumption

The highest-risk assumption is not technical.

It is behavioral:

> Will the admin use the product for every confirmed order, or will creating an order feel like extra work?

If the admin does not consistently create orders, the product will not become part of the shop’s workflow.

For this reason, order creation speed is more important than the number of features.

---

## 14. Pilot Plan

The MVP should be piloted with two existing shops:

- One shop with high DM volume
- One shop with lower DM volume

The pilot should continue for:

- At least two weeks, or
- At least 20 real orders

Whichever takes longer.

During the pilot, the team should measure:

- Number of confirmed sales
- Number of orders created in the product
- Time required to create an order
- Percentage of links opened
- Percentage of forms completed
- Number of incomplete orders
- Number of status checks
- Number of customer follow-up messages
- Number of lost addresses or forgotten orders
- Number of days the admin actively used the product
- Reasons why an order was not entered into the product

---

## 15. MVP Success Criteria

The MVP is considered promising if:

- At least 80% of confirmed orders are entered into the product
- Median order creation time is under 30 seconds
- At least 70% of customers complete the form without assistance
- Lost information for registered orders is reduced close to zero
- The admin uses the product at least four days per week
- At least one pilot shop is willing to pay for the next month
- The dashboard becomes the main place for checking order status

---

## 16. Signals That the Product Needs to Change

The product may need a pivot or major adjustment if:

- Customers complete the form, but admins do not create orders
- Admins only use the product during very busy days
- The customer status page is rarely used
- Payment confirmation is a much bigger problem than order tracking
- Admins say direct Instagram integration is required before they will continue
- Managing multiple pages is more valuable than managing individual orders
- Automated answers are more valuable than structured order handling
- Customers frequently refuse to open the link

---

## 17. Stop Criteria

The product should be reconsidered or stopped if:

- Less than half of confirmed orders are entered into the system
- Admins return to using only DMs after a few days
- Creating and sending the link is considered extra work
- Neither pilot shop is willing to pay
- A simple spreadsheet solves the problem well enough
- Customers consistently fail to open or complete the form
- The problem happens too rarely to justify a subscription

---

## 18. Initial Pricing Hypothesis

The initial pricing is still a hypothesis.

Suggested pilot offer:

- Free setup
- Free product entry
- 14-day trial
- Founder plan around 390,000 toman per shop per month

Possible post-validation range:

- Approximately 490,000 to 690,000 toman per shop per month

The product should not compete only on price.

The real value should be:

- Fewer forgotten orders
- Fewer lost addresses
- Less admin stress
- Faster order lookup
- Fewer customer follow-up messages
- Better operational visibility

---

## 19. Future Opportunities After Validation

Only after the MVP proves repeated use and willingness to pay should the product consider:

- Faster order creation shortcuts
- Multi-admin collaboration
- Multi-shop plans
- Telegram or SMS reminders
- Payment links
- Online payment gateway
- Direct Instagram integration
- Ready-made reply templates
- Order assignment
- Delayed-order alerts
- Limited public product pages
- Simple performance reports
- Shipping service integration

These are not part of the MVP commitment.

---

## 20. Final MVP Definition

The MVP is a Persian, mobile-first order handoff and tracking tool for Instagram shops.

It starts after the customer agrees to buy.

The admin creates a lightweight order and sends a unique link.

The customer submits delivery details and one payment receipt together.

The admin tracks the order through a small set of statuses.

The customer checks progress through the same link.

The MVP succeeds only if this behavior becomes a normal part of the shop’s daily workflow.

> The product does not replace Instagram DMs. It turns a confirmed DM sale into an organized, trackable order.
