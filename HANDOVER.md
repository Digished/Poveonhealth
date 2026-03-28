# Poveon Health — Handover Note

**Branch:** `claude/setup-supabase-staging-keys-TxMG5`
**Last commit:** `a850f10` — fix: LabWalletButton now loads existing DVA from DB on mount
**Date:** March 2026

---

## Platform Overview

Poveon Health is a multi-tenant healthcare SaaS platform connecting:
- **Doctors** — submit lab test requests for patients
- **Labs** — receive, process, and return test results
- **Patients** — view results via patient portal
- **Admin** — manage labs, commission, wallet, users
- **Marketers** — referral/affiliate system with unique codes

Built on: **Next.js 14 App Router · TypeScript · Prisma 5 · Supabase PostgreSQL · Paystack**

---

## Completed Features

### Doctor Portal (`/doc-login`)
- [x] Email OTP login flow (send → verify → set PIN)
- [x] Multi-step onboarding for new doctors: prefix selection, full name, phone, hospital(s)
- [x] `PrefixSelectInput` — portal-based dropdown (Dr., Prof., Nurse, Pharm., etc.) consistent with `HospitalTagInput`
- [x] `HospitalTagInput` — multi-select, DB-only (no custom add), search popup
- [x] `DoctorProfile.hospitals String[]` — multiple hospitals supported (migrated from single `hospital String?`)
- [x] Doctor dashboard with request history, profile edit, bank account

### Lab Portal (`/lab-dashboard`)
- [x] Owner + team member auth with RBAC (granular permissions per role)
- [x] Request management: incoming → seen → done flow
- [x] Commission tracking (Poveon tab): `poveon_amount`, `lab_revenue_amount`, `is_paid_to_poveon` per request
- [x] Price list / catalog management
- [x] Wallet panel in Poveon tab: balance, DVA account, payment history
- [x] Mobile-friendly Poveon tab (responsive grid, overflow-x-auto on breakdown table)

### Admin Dashboard (`/admin`)
- [x] Labs management (create, edit, delete, analytics, catalog, branches, team, API keys)
- [x] Users tab — view and delete doctor portal users
- [x] Revenue dashboard
- [x] Hospital management (create/edit hospitals for doctor selection)
- [x] Knowledge base (KB) tests with synonyms
- [x] System settings (default commission %)
- [x] Wallet DVA button per lab card (now loads from DB on mount — no more blank state)

### Wallet System (DVA via Paystack)
- [x] Schema: `lab_wallets` + `lab_wallet_credits` (credits-only, clean rebuild from scratch)
- [x] DVA provisioning: `POST /api/admin/wallet/provision/[labId]` — creates Paystack customer + DVA
- [x] Webhook: `POST /api/paystack/webhook` — HMAC-SHA512 verified, idempotent credit recording
- [x] Lab wallet view: `GET /api/lab/wallet` — balance + DVA details + payment history
- [x] Admin wallet view: `GET /api/admin/wallet` + `GET /api/admin/wallet/[labId]`
- [x] Manual credit: `POST /api/admin/wallet/credit` — verify Paystack reference + credit missed payments
- [x] Reset endpoint: `POST /api/admin/wallet/reset` — clears old negative balance data (one-time cleanup)
- [x] `LabWalletButton` loads existing state from DB on mount (no more blank/re-provisioning on every load)

### Home & Lab Pages
- [x] Scroll CTA on hero sections: "No login needed · scroll to fill a request" with bouncing arrow
- [x] Snap-scroll layout

### Infrastructure
- [x] `prisma generate && prisma db push --accept-data-loss` in build script — auto-migrates on Vercel deploy
- [x] `export const dynamic = "force-dynamic"` on all API routes
- [x] API call logging (`ApiLog` model)
- [x] Lab activity audit trail (`LabActivity` model)

---

## Known Issues & Bugs

### 1. Wallet Transactions Not Reflecting (CRITICAL)

**Status:** Architecture is correct but end-to-end not yet fully verified in production.

**Symptoms:** DVA payments made to the virtual account do not appear in lab wallet balance or payment history.

**Root causes that were fixed:**
- Tables (`lab_wallets`, `lab_wallet_credits`) didn't exist in DB. Fixed via `prisma db push` in build script.
- `prisma.$transaction(async tx => {...})` was used with `$executeRawUnsafe` inside — this breaks under PgBouncer (Supabase uses PgBouncer on port 6543, transaction pooling mode, which does not support interactive transactions). Fixed by removing all Prisma interactive transactions and using plain sequential Prisma ORM calls.
- Old negative balance data from commission deductions persisted after schema rebuild because `prisma db push` ALTERs existing tables rather than dropping/recreating them. Fixed via `POST /api/admin/wallet/reset`.
- `LabWalletButton` wasn't loading existing wallet state from DB on mount — caused repeated re-provisioning confusion. Fixed with `useEffect` on mount.

**Action required to verify:**
1. Ensure latest deploy has run (`prisma db push` creates `lab_wallet_credits` table in production DB)
2. Call `POST /api/admin/wallet/reset` once while logged in as admin (clears any stale data)
3. Make a small test DVA payment to one of the provisioned accounts
4. Check Supabase → `lab_wallet_credits` table for a new row
5. If no row appears, check Vercel logs for `[webhook]` prefix to trace where processing fails

---

### 2. Commission Amounts Wrong in Poveon Tab (CRITICAL — DATA ISSUE)

**Status:** Code is correct, production data is wrong.

**Symptom:** The commission shown per request equals the FULL test price, not a percentage.

**Root cause:** `commission_pct` in the `lab_offered_tests` table is set to `100` in the production database. This makes:
```
poveon_fee = lab_price × 100 / 100 = lab_price
```
So the full price is recorded as Poveon's commission — which is wrong.

**Fix — run in Supabase SQL editor:**
```sql
-- Replace 15 with the actual commission percentage for the lab
UPDATE lab_offered_tests
SET commission_pct = 15,
    poveon_fee = ROUND((lab_price * 15 / 100), 2)
WHERE lab_id = '<lab_id_here>';
```

Alternatively, re-upload the lab's price list CSV from the admin catalog tab — the CSV uploader recalculates `poveon_fee` from `commission_pct` at upload time, so uploading a fresh CSV with the correct `commission_pct` column will fix all rows.

**NOTE: This is a data fix, not a code fix. The code that calculates commissions is correct.**

---

### 3. `is_paid_to_poveon` Never Set to True

**Status:** Unresolved by design — commission auto-deduction was removed.

**Context:** The original wallet system was auto-deducting commission from the lab's wallet every time a request was marked "Seen". This caused:
- Negative wallet balances (wallet was 0 before any DVA payment arrived)
- Full test price deducted (due to `commission_pct = 100` data bug above)

The auto-deduction logic was removed entirely during the wallet rebuild. The wallet is now credits-only (DVA top-ups). Commission tracking fields (`poveon_amount`, `is_paid_to_poveon`) still exist on the `requests` table and are calculated correctly, but there is currently no mechanism to mark commissions as paid.

**Pending decision — choose one approach:**
- **Auto-deduction from wallet** when request is marked Seen (requires fixing `commission_pct` data first, and ensuring wallet has sufficient balance before deducting)
- **Manual admin settlement** — admin views outstanding commissions per lab and clicks "collect"
- **Monthly batch settlement** — scheduled job or manual SQL to settle commissions monthly

---

### 4. No Admin Wallet Overview Tab

**Status:** API exists, no UI.

`GET /api/admin/wallet` returns all lab wallet balances and DVA status, but there is no tab in the admin dashboard to display this aggregate view. Wallet info is currently only accessible per-lab-card via the `LabWalletButton` component on each lab card.

---

## Pending Tasks

- [ ] Verify end-to-end DVA payment flow in production (call reset → make test payment → check Supabase `lab_wallet_credits` table)
- [ ] Fix `commission_pct` data in `lab_offered_tests` — run SQL update in Supabase (see fix above)
- [ ] Decide and implement `is_paid_to_poveon` settlement mechanism (auto-deduction vs manual vs batch)
- [ ] Add admin "Wallets" tab showing all lab balances and outstanding commission totals
- [ ] Going live: swap `PAYSTACK_SECRET_KEY` from `sk_test_xxx` to `sk_live_xxx` in Vercel env vars (webhook URL stays the same — no URL change needed when going live)

---

## Architecture

### Database Schema (key models)

```
Lab
├── LabWallet (1:1) — balance, DVA info, paystack_customer_id
│   └── LabWalletCredit (1:many) — every DVA payment received
├── Request (1:many) — test requests
│   ├── poveon_amount        — Poveon commission for this request
│   ├── lab_revenue_amount   — Lab's revenue for this request
│   └── is_paid_to_poveon    — commission settlement flag (currently always false)
└── LabOfferedTest (1:many) — test catalog with lab_price, poveon_fee, commission_pct
```

### Wallet Money Flow (DVA Credits)

```
Lab pays → DVA account (Paystack virtual bank account)
    ↓ Paystack fires webhook to /api/paystack/webhook
    ↓ Verifies HMAC-SHA512 signature (returns 200 on bad sig — Paystack requires it)
    ↓ Filters for charge.success where channel.includes("nuban")
    ↓ Finds LabWallet by paystack_customer_id (fallback: dva_account_number)
    ↓ Idempotency check: reference UNIQUE — skip if already credited
    ↓ Creates LabWalletCredit row (amount, balance_after, reference, sender info)
    ↓ Updates LabWallet.balance += amount
    ↓ Lab sees new balance in Poveon tab → wallet panel
```

### Commission Tracking Flow (separate from wallet)

```
Doctor submits request
    ↓
Lab marks request as "Seen"
    ↓ POST /api/requests/update-status
    ↓ resolveTests() matches test names against lab catalog
    ↓ Calculates poveon_fee per test (= lab_price × commission_pct / 100)
    ↓ Stores poveon_amount + lab_revenue_amount on request
    ↓ is_paid_to_poveon remains false (no auto-deduction currently)
    ↓ Poveon tab shows outstanding commission per request
```

### Key API Endpoints

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/paystack/webhook` | POST | Paystack HMAC | Receive DVA payments |
| `/api/lab/wallet` | GET | Lab + permission | Lab's wallet balance + history |
| `/api/admin/wallet` | GET | Admin | All lab wallets summary |
| `/api/admin/wallet/[labId]` | GET | Admin | Single lab wallet status |
| `/api/admin/wallet/provision/[labId]` | POST | Admin | Create Paystack customer + DVA |
| `/api/admin/wallet/credit` | POST | Admin | Manual credit (missed webhook) |
| `/api/admin/wallet/reset` | POST | Admin | Reset all balances to 0 (one-time) |
| `/api/requests/update-status` | POST | Lab | Mark request Seen/Done |
| `/api/lab/poveon` | GET | Lab + permission | Commission dashboard data |

---

## Environment Variables

| Variable | Notes |
|---|---|
| `PAYSTACK_SECRET_KEY` | `sk_test_xxx` for test mode, `sk_live_xxx` for live |
| `DATABASE_URL` | Supabase transaction pooler URL (port **6543**) — used by Prisma at runtime |
| `DIRECT_URL` | Supabase direct connection URL (port **5432**) — used by `prisma db push` at build time |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `RESEND_API_KEY` | Email service (OTP emails) |
| `OPENAI_API_KEY` | GPT-4o for test name extraction from images |

**Important — PgBouncer note:** Supabase uses PgBouncer on port 6543 in transaction pooling mode. This means `prisma.$transaction(async tx => {...})` interactive transactions DO NOT work reliably. All wallet code uses plain sequential Prisma calls (no interactive transactions). Do not re-introduce `prisma.$transaction` with `$executeRawUnsafe` inside — it will break silently under load.

---

## Key File Locations

```
src/
├── app/
│   ├── api/
│   │   ├── paystack/
│   │   │   └── webhook/route.ts              — DVA payment handler (rebuilt from scratch)
│   │   ├── admin/wallet/
│   │   │   ├── route.ts                      — GET all lab wallets
│   │   │   ├── [labId]/route.ts              — GET single lab wallet status
│   │   │   ├── provision/[labId]/route.ts    — POST provision DVA for lab
│   │   │   ├── credit/route.ts               — POST manual credit (verify Paystack ref)
│   │   │   └── reset/route.ts                — POST reset all balances (one-time cleanup)
│   │   ├── lab/
│   │   │   └── wallet/route.ts               — GET lab's own wallet (balance + history)
│   │   └── requests/
│   │       └── update-status/route.ts        — Mark Seen/Done (commission calc, no wallet deduction)
│   ├── doc-login/page.tsx                    — Doctor onboarding flow
│   ├── admin/page.tsx                        — Admin dashboard
│   └── lab-dashboard/page.tsx                — Lab dashboard
├── components/
│   ├── AdminDashboard.tsx                    — LabWalletButton (loads from DB on mount)
│   ├── LabDashboard.tsx                      — LabWalletPanel, LabPoveonView
│   └── ui/
│       ├── PrefixSelectInput.tsx             — Portal dropdown for title/prefix
│       └── HospitalTagInput.tsx              — Multi-select hospital input
└── lib/
    └── resolve-tests.ts                      — Matches request test names to lab catalog

prisma/
├── schema.prisma                             — Full DB schema
└── migrations/
    ├── 20260327000000_add_poveon_commission_fields/
    ├── 20260327000001_drop_master_catalog/
    ├── 20260327000002_add_wallet_tables/      — superseded by 000003
    └── 20260327000003_rebuild_wallet/        — current clean wallet schema (lab_wallets + lab_wallet_credits)
```

---

## Going Live Checklist

- [ ] Swap `PAYSTACK_SECRET_KEY` from `sk_test_xxx` to `sk_live_xxx` in Vercel environment variables
- [ ] Webhook URL does **NOT** change — same endpoint works for both test and live mode
- [ ] Verify DVA provisioning works with live key (make a test provision + small payment)
- [ ] Fix `commission_pct` data in `lab_offered_tests` (see Known Issues #2)
- [ ] Decide `is_paid_to_poveon` settlement approach before launch (see Known Issues #3)
- [ ] Call `POST /api/admin/wallet/reset` on live DB before first real payment (cleans any stale test data)
