# QURUX MAKEOVER & ACADEMY — MASTER NOTE

> ⚠️ **READ THIS FILE FIRST** before starting ANY new work.
> This is the single source of truth for what the system is, what the
> **BOB plan** is, what has already been done, and what must NEVER be broken.
> There is also the original concept document:
> `C:\Users\acer\Downloads\Qurux_Master_Implementation_Note.docx`

---

## 1. Project Overview

Qurux Makeover & Academy = complete beauty platform:
Beauty/Salon services + Home Beauty services + Salon bookings +
ESSN Cosmetics Shop + Academy/Courses + Customer accounts +
Admin panel + BOB Wallet (savings) + EMI + Split payments +
manual (copy-paste) WhatsApp dispatch + admin service closure + ratings.

Theme: pink + white, premium beauty/salon feel, mobile + desktop responsive.

---

## 2. Architecture (LIVE — all deployed)

```
www.qurux.in        → FRONTEND  (Next.js, Vercel)
api.qurux.in        → BACKEND   (Express, Railway — auto-deploys from GitHub master)
MongoDB Atlas       → DATABASE  ("qurux" DB, cloud)
```

- Frontend repo:  `truetspl-sudo/qurux-frontend`  (folder `C:\Users\acer\OneDrive\Desktop\quruxfrontend`)
- Backend repo:    `truetspl-sudo/qurux-backend`   (folder `C:\Users\acer\OneDrive\Desktop\quruxbacken+database`)
- Frontend deploy: Vercel CLI (`npx vercel --prod --yes`) from quruxfrontend folder.
- Backend deploy:  push to GitHub `master` → Railway auto-deploy.
- Vercel env: `NEXT_PUBLIC_API_URL=https://api.qurux.in` (production).
- Railway env: `MONGODB_URI`, `ADMIN_PASSWORD`, `PORT=8080`.
- Backend serves under `/api` → routes mounted from `server.js`.

---

## 3. NON-NEGOTIABLE RULES (never break these)

1. **BOB = MANUAL PAYMENT APPROVAL SETUP.**
   - Customer submits a **deposit request** (amount + UPI transaction/UTR).
   - Deposit is created with status **PENDING** — it is NOT credited automatically.
   - Admin reviews it in `admin/bob-payments`, clicks **APPROVE** (or REJECT).
   - On approval the deposit becomes **ACTIVE** and the 30-day beauty-benefit
     clock starts from the **approval date**.
   - On rejection the deposit is REJECTED and never credited.
   - Do NOT make deposits auto-ACTIVE. Do NOT remove the PENDING step.

2. **NO PAYMENT GATEWAY ANYWHERE. EVERYTHING IS MANUAL.**
   - Customer pays via UPI to the business account (QR / `qurux@upi`),
     then submits transaction ID + optional screenshot as a **Payment record
     (status PENDING)**.
   - Admin verifies in his bank app / WhatsApp, then clicks APPROVE in the
     admin panel. Approving a Payment marks the linked booking/order PAID.
   - Backend NEVER auto-marks FULL bookings/orders as PAID. Only BOB-wallet
     payments may be PAID at creation (wallet money already inside Qurux).

3. **NO WHATSAPP API INTEGRATION. MANUAL COPY-PASTE ONLY.**
   - Every admin page has a copy-to-clipboard WhatsApp message template.
   - Admin copies it, pastes it into WhatsApp, sends manually.

4. **LOGIN IS BY USER ID — NEVER EMAIL.**
   - Signup collects: Name, Mobile, Password (NO email field anywhere).
   - Admin approves the PENDING customer and **manually types the User ID**
     (shown to customer over WhatsApp by admin).
   - Customer logs in with **User ID + the password they chose at signup**.
   - "Sign in with email" / OTP login: do not exist, do not add.

5. **PAYMENT/GATEWAY-free flows apply to: bookings, shop orders, EMI,
   BOB deposits, courses — all money movement goes through PENDING →
   admin approve.**

6. **Never silently invent fake/demo data** in admin pages. If API returns
   empty or 401, show empty state + clear "login as Admin required" banner.

7. **SERVICE BOOKING PAYMENT = PAY AFTER SERVICE — KISI BHI OPTION ME.**
   - Customer selects ANY option (Full Payment / No Cost EMI / Pay from BOB)
     for a SERVICE booking → booking is created PENDING via `/bookings` with
     the chosen `paymentMethod` (FULL/EMI/BOB). NO payment step, NO
     PaymentForm, NO wallet deduction at booking time (booking page has no
     separate EMI/BOB localStorage logic anymore — `/booking` was rewritten).
   - Confirmation says: "Booking ke waqt koi payment nahi — service hone ke
     BAAD payment (UPI/Cash)."
   - Admin closes the service in `admin/closures` — closure modal now has a
     **Payment Update** section: PAID VIA (mode: CASH/UPI/BOB/EMI) + PAYMENT
     STATUS (PAID/PARTIAL/PENDING) + AMOUNT COLLECTED. Backend
     `/bookings/:id/close` writes paymentStatus + cashAmount + paidVia onto the booking.
   - **EMI closure → EMIPlan AUTO-CREATE.** When admin closes in **EMI** mode
     (ya booking EMI se chuni gayi thi) the backend auto-creates/updates the
     customer's EMIPlan (`utils/emiSync.js`): purchaseType SERVICE,
     purchaseName = service naam, totalAmount, paidAmount = abhi collected,
     pendingAmount = balance. Customer ke "EMI Details" (/account/dashboard,
     /bob My Purchases/EMI) me dikhta hai: kaun si service li, kitna pay kiya,
     kitna balance. Balance flexible EMI repayments (`/emi/:id/pay` → admin
     approve) se ghatta hai; plan COMPLETED hone par booking apne aap PAID
     (due ₹0). FULL/CASH/UPI/BOB full close → koi plan nahi, booking PAID,
     due ₹0.

8. **PRODUCTS / COURSES ORDERS = SAME MANUAL MODEL AS SERVICE BOOKINGS.**
   - Shop checkout `/checkout` and any course order: customer just submits the
     order → order created PENDING (NO auto-PAID, NO forced PaymentForm step).
     Payment proof is not collected at order time.
   - Admin verifies payment on WhatsApp and updates order payment manually in
     `admin/orders` (Payment Update section: PAID VIA mode + PAID/PARTIAL/PENDING
     + amount, `PATCH /orders/:id/pay`) exactly like service closures, and drives
     order status (CONFIRMED → SHIPPED → DELIVERED).
   - **EMI order → EMIPlan AUTO-CREATE (PRODUCT).** Same rule as bookings:
     EMI mode pay/close pe product plan banta hai (purchaseName = items list,
     total/paid/balance) jo customer ke EMI details me dikhta hai; full pay →
     due ₹0.

9. **BOB HAS NO SEPARATE LOGIN.** Website login (User ID + password) IS the
   BOB login. No `bobApplications`, no separate BOB password, no
   "BOB me login karein" gate anywhere. BOB page/options identify the
   customer from the website login only.

10. **COMPANY UPI BARCODE = `public/payment/quruxbarcode.png`** (original from
    `Desktop/final`). Used in BOB deposit form, BOB EMI pay modal, and
    PaymentForm QR. Deposit proof = transaction ID + screenshot upload.

---

## 4. Data Layer (backend `routes/` + `models/`)

| Model | Purpose |
|---|---|
| User | customer + admin + (salon) — role, status PENDING/APPROVED/REJECTED, userId |
| Salon | vendor list (approved by admin) |
| Service | beauty services catalog (categories like Bridal/Party/Facial/...) |
| Booking | service booking (HOME min ₹2,500 / SALON), paymentMethod FULL/EMI/BOB/MIXED |
| Product | ESSN shop products (stock tracked, slug used by frontend) |
| Course | academy courses |
| Order | shop orders (items resolved from Product by _id or slug) |
| Payment | UPI proof submissions: bookingId/orderId refs, PENDING → APPROVED/REJECTED |
| EMIPlan | No-Cost EMI plans + flexible repayment history |
| Wallet | **BOB wallet**: deposits[], usageHistory[], promotionalBalance/history |
| Rating | ratings/reviews captured at admin closure |
| WhatsAppDispatch | (exists; UI derives dispatch list from live bookings) |

Routes: auth, customers, salons, services, bookings, products, courses,
orders, payments, emi, wallet, ratings, admin, whatsapp — all under `/api`.

Key behavior already fixed (verified by live E2E):
- `POST /bookings` & `/orders`: `paymentStatus` = PENDING for FULL (NO auto-PAID).
- `PATCH /payments/:id/approve` → also sets linked booking/order `paymentStatus: PAID`.
- `PATCH /bookings/:id/pay`, `PATCH /orders/:id/pay` → admin manual mark PAID.
- `PATCH /bookings/:id/close` → COMPLETED + rating record upsert.
- Booking/order IDs are human strings (`BK-…`, `ORD-…`) — backend resolves them.
- `POST /auth/register` → status PENDING; admin assigns userId.

---

## 5. BOB WALLET — FULL PLAN (manual approval)

Customer page: `/bob` (customer must be logged in — website login = BOB login).

BOB = "Bank of Beauty": beauty savings account. 5 tabs:
1. **Saving for Beauty** — deposits + pending requests + benefit table.
2. **My Purchases / EMI** — purchases paid from BOB / EMI plans.
3. **Payment** — pay/repay EMI from here (manual UPI proof).
4. **Statement** — bank-style statement (download CSV).
5. **Profile** — BOB account number + details.

### Deposit lifecycle
```
Customer:  /bob → Make a Deposit (amount + optional UPI ref)
   ↓ POST /wallet/deposit
Wallet.deposits[] entry created → status = PENDING  (NOT counted in balance)
   ↓
Admin: /admin/bob-payments → PENDING queue → ✓ APPROVE / ✕ REJECT
   ↓ PATCH /wallet/:walletId/deposits/:depositId/approve
status = ACTIVE, approvedAt = now, depositDate = now (benefit clock starts)
balance/benefit now visible to customer
```

### Benefits (server-computed)
- 30 days after ACTIVE deposit → **+20% beauty benefit**.
- Then **+10% per month**, max **+100%** of original amount.
- Using BOB money before 30 days → benefit disabled for that deposit.
- FIFO: oldest deposit used first. Deposits tracked individually.

### Balance model
- eligibleSaving = Σ (ACTIVE originalAmount − usedAmount)
- available = eligibleSaving + benefit + promotionalBalance
- PENDING / REJECTED deposits are excluded from every balance calc.

### Admin pages
- `/admin/bob`            → BOB Wallet: all wallets, deposits, balances, **🎁 Credit Promo**.
- `/admin/bob-payments`   → **Manual deposit approval queue** + WhatsApp copy template.

### Wallet API
`/wallet/me` `/wallet/deposit` (PENDING) `/wallet/requests` (admin)
`/wallet/:wId/deposits/:dId/approve` & `/reject` (admin) `/wallet/use` (FIFO)
`/wallet/promotional` (admin) `/wallet/all` (admin) `/wallet/balance`

---

## 6. WHAT IS DONE & LIVE (verified)

- Landing page (Book Now / Shop / Learn / About / Contact).
- Services: browse + service detail + booking w/ HOME (₹2,500 min) or SALON.
- **Booking flow: Full Payment → real PaymentForm (UPI proof → PENDING → admin approve).**
  EMI/BOB options inside `/booking` are still legacy-local (gap, see §8).
- Shop: category browse, product detail (ingredients/how-to-use/benefits),
  cart, checkout. **Order created PENDING first → PaymentForm submits proof
  with orderId → admin Payments approve → order PAID.** 9 products seeded in DB.
- Academy/learn page + course admin management.
- Signup (no email) → admin approve w/ manual userId → login by userId+password.
- Change password (admin settings + customer account) — live tested.
- Customer dashboard (`/account/dashboard`) — real API: bookings, orders,
  payments, BOB wallet, EMI, reviews.
- **BOB wallet customer page + manual deposit approval — live tested.**
- EMI flexible repayments (₹10+) with admin approve — live tested.
- Admin panel (17 pages) all wired to real API, mock data removed,
  login-required error banners added.
  Customers (approve w/ userId), Bookings, Payments (approve/reject +
  screenshot link), Orders, EMI, Services, Products, Courses, Salons
  (approve/reject), Ratings, Closures (close + rating), WhatsApp dispatch,
  BOB payments, BOB wallet, Settings (Change Password real).
- WhatsApp templates: copy-message buttons on approve flows.
- PaymentForm is REAL (no fake timer): screenshot upload + Payment record.
- E2E (live): signup→approve→login→book→pay→admin verify→close→rating = 9/9.
  Manual-payment model test (order/booking stay PENDING until approval) passed.
  BOB deposit request→approve→credit + reject test passed.
- Deploy: qurux.in (Vercel), api.qurux.in (Railway + SSL), MongoDB Atlas.

---

## 7. Original Master-Plan checklist (from docx) → status

| # | Item | Status |
|---|---|---|
| 3 | Landing page | ✅ |
| 4–8 | Book Now flow (service → form → HOME/SALON) | ✅ |
| 9 | Signup/Login manual (no OTP, userId) | ✅ |
| 10 | Salon/vendor registration + admin approval | ✅ |
| 11 | ESSN Shop | ✅ |
| 12 | Learn/Academy | mostly ✅ (purchase flow check) |
| 13 | Universal checkout (Full/EMI/BOB/Mixed) | FULL ✅ — EMI/BOB/Mixed partial |
| 14 | BOB Wallet | ✅ (manual approval) |
| 15 | EMI + repayments | ✅ (flexible, admin approve) |
| 16 | Mixed/Split payment | ⏳ placeholder |
| 17 | WhatsApp dispatch | ✅ manual copy-paste |
| 18–19 | Service execution + admin closure | ✅ |
| 20 | Universal ratings | ✅ |
| 21 | Customer dashboard | ✅ |
| 22–24 | Admin panel structure + DB-driven frontend | ✅ |
| 25–27 | Schema, roles, security (JWT) | ✅ |
| 31 | Testing (E2E) | ✅ live |
| 32 | Deployment | ✅ |

---

## 8. KNOWN GAPS / NOT DONE YET

1. EMI plans are now auto-created when admin CLOSES an EMI-mode booking/order
   (closure payment section → PAID VIA = EMI) — service/product naam, total,
   paid, balance customer ke EMI Details me dikhta hai (see rules 7/8).
   `/emi` POST still has no standalone customer-facing trigger (not needed —
   closure is the trigger). COURSE EMI: course purchase/enroll order flow abhi
   bhi nahi hai (academy pages static) — jab course order flow banega to
   `utils/emiSync.js` COURSE purchaseType ke saath EMI plan banayega.
2. Mixed/Split payment logic in checkout is placeholder (₹0 hardcoded).
3. Course customer purchase/enrollment full flow not yet verified E2E.
4. Salon public registration page exists (`/salon/register`) — verify wiring.
5. `admin/content` (Website Content) and most of `admin/settings` are static —
   only Change Password is DB-backed.
6. WhatsApp "SENT" state is derived from bookings (resets) — fine for manual use.

---

## 9. WORKFLOW RULES FOR FUTURE TURNS

1. **Before ANY new feature/edit: read `QURUX_MASTER_NOTE.md` (this file).**
2. If unsure about original intent → read the docx master note in Downloads.
3. Ask the user before changing anything in the BOB flow semantics or the
   manual-payment rule — they are strict.
4. When user is NOT watching, do NOT silently redesign existing flows
   (esp. BOB) — follow this note, make minimal edits, and explain changes.
5. After code changes: `npx tsc --noEmit` (frontend), `node -e require(...)`
   syntax check (backend), then commit + push (backend auto-deploys) +
   `npx vercel --prod --yes` (frontend), then live E2E against api.qurux.in.
6. Admin test account is created from Railway `ADMIN_PASSWORD`; do not
   hardcode passwords into files that may be pushed to the repos.

---

_Last updated: after "manual payment everywhere" fix (PaymentForm real,
no auto-PAID, admin approve queues) + BOB deposit approval flow._
