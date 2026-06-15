# Poveon Health — Data Schema & Integration Reference

A complete reference to the Poveon Health data model and the entities a partner
laboratory (LIMS) interacts with when integrating over the API.

- **Stack:** Next.js 14 (App Router) · TypeScript · Prisma 5 · PostgreSQL (Supabase) · Paystack
- **Source of truth:** `prisma/schema.prisma`
- **API reference (interactive):** `https://poveon.com/api-docs`
- **Conventions:**
  - Times are `TIMESTAMP(3)` (UTC, millisecond precision).
  - Money is `DECIMAL(12,2)` in **Naira (₦)** unless stated otherwise.
  - IDs are UUID strings unless the model uses a natural key (e.g. `email`).
  - `@@map("...")` shows the underlying SQL table name.

---

## 1. How a lab connects (integration overview)

A laboratory integrates by authenticating with an **API key** and working with
the **`Request`** entity through its lifecycle.

### Authentication

Every lab endpoint accepts **either** a logged-in session cookie (portal) **or**
an API key header — both resolve to the same lab, scoped by role permissions.

```
X-Poveon-Api-Key: pvn_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- Keys are generated in **Admin → Labs → Developer panel** and stored **hashed**
  (`LabApiKey.key_hash`). The raw key is shown **once** at creation.
- Keys carry the lab's full permission set. Treat them as secrets (server-side only).

### The request lifecycle

```
incoming ──▶ seen ──▶ done
   │           │         │
 created    patient    results
 by a       arrived    delivered
 doctor/    at lab     to doctor/patient
 patient/
 LIMS
```

| Status     | Meaning                                                            |
|------------|-------------------------------------------------------------------|
| `incoming` | Request created; patient has not yet arrived at the lab.          |
| `seen`     | Lab acknowledged / patient arrived. Commission is computed here.  |
| `done`     | Tests complete; results attached and delivered.                  |

### Key endpoints (see `/api-docs` for full schemas)

| Method | Path                          | Auth   | Purpose                                  |
|--------|-------------------------------|--------|------------------------------------------|
| GET    | `/api/labs`                   | public | List labs (id, name, branches).          |
| POST   | `/api/requests/create`        | public | Create a lab test request.               |
| GET    | `/api/lab/requests`           | lab    | List this lab's requests.                |
| POST   | `/api/requests/retrieve`      | lab    | Fetch one request by its code.           |
| POST   | `/api/requests/update-status` | lab    | Move a request `incoming → seen → done`. |
| POST   | `/api/requests/send-results`  | lab    | Attach a result link / PDF / note.       |

---

## 2. Core lab domain

### `Lab` — `labs`
The laboratory tenant. Branded pages, catalog, branches, team, wallet and
commission settings all hang off this.

| Field                 | Type        | Notes |
|-----------------------|-------------|-------|
| `id`                  | String (PK) | UUID. |
| `name`                | String      | Display name. |
| `slug`                | String?     | Unique URL slug for the branded page `/[labSlug]`. |
| `address`             | String?     | Primary address. |
| `phones`              | Json        | `[{ number, label }]`. |
| `whatsapp`            | String?     | E.164 WhatsApp number. |
| `logo_url`            | String?     | Branding. |
| `hero_image_url`      | String?     | Branded page background. |
| `notification_email`  | String?     | Branded "from" address for the lab's outgoing emails. |
| `service_categories`  | String[]    | Test categories the lab offers. |
| `search_hidden`       | Boolean     | Hide from public lab search. |
| `free_trial`          | Boolean     | Trial flag. |
| `created_at`          | DateTime    | |

### `LabBranch` — branches of a lab
Multiple physical locations for one `Lab` (name, address, phones).

### `LabOfferedTest` — `lab_offered_tests`
The lab's price list / catalog. One row per offered test.

| Field            | Type           | Notes |
|------------------|----------------|-------|
| `id`             | String (PK)    | |
| `lab_id`         | String (FK)    | → `Lab`. |
| `raw_name`       | String         | Test name as the lab provides it. |
| `category_label` | String?        | Category grouping. |
| `synonyms`       | Json/String[]  | Alternate names for matching. |
| `lab_price`      | Decimal        | Patient-facing price (₦). |
| `commission_pct` | Int/Decimal    | Poveon's commission percentage for this test. |
| `poveon_fee`     | Decimal        | Pre-computed `lab_price × commission_pct / 100`. |

> **Commission:** when a request is marked `seen`, each resolved test's
> `poveon_fee` is summed into the request's `poveon_amount`; the remainder is the
> `lab_revenue_amount`.

### `LabApiKey` — `lab_api_keys`
Hashed developer/LIMS keys. `key_hash` (never the raw key), `label`, `last_used_at`,
`created_at`. Sent as `X-Poveon-Api-Key`.

### `LabUser`, `LabMember`, `LabRole` — team & RBAC
- `LabUser` — the lab **owner** (links a Supabase auth user to a `Lab`).
- `LabMember` — staff members with an assigned `LabRole`.
- `LabRole` — granular permissions: `can_view_requests`, `can_update_status`,
  `can_send_results`, `can_manage_api_keys`, `can_view_marketers`, etc.
  API keys and the owner are granted the **full** permission set.

### `LabWallet` / `LabWalletCredit` — wallet (Paystack DVA)
- `LabWallet` (1:1 with `Lab`) — running `balance`, dedicated virtual account
  (`dva_account_number`, `dva_bank`), `paystack_customer_id`.
- `LabWalletCredit` (1:many) — every top-up received, keyed by unique Paystack
  `reference` (idempotent), with `amount`, `balance_after`, sender info.

### `LabActivity`, `LabFeedback`
Audit trail of team actions, and feedback collected from doctors about a lab.

---

## 3. The central entity: `Request` — `requests`

A single lab test request. Created by a doctor, a self-serve patient, or a LIMS,
and progressed by the lab.

| Field                 | Type        | Notes |
|-----------------------|-------------|-------|
| `id`                  | String (PK) | UUID. |
| `code`                | String      | Unique, human-shareable, e.g. `LABA-8X4K29Q`. The patient presents this at the lab. |
| `lab_id`              | String (FK) | → `Lab`. |
| `status`              | String      | `incoming` \| `seen` \| `done`. |
| `doctor_email`        | String?     | **NULL = self-service patient**; set = doctor-referred. |
| `doctor_name`         | String?     | |
| `patient_name`        | String?     | |
| `patient_phone`       | String?     | E.164. |
| `patient_email`       | String?     | Used for portal auto-fill and result delivery. |
| `tests`               | String      | Requested tests (free text / comma list). |
| `condition`           | String?     | Symptoms / clinical note. |
| `schedule`            | String?     | Requested appointment time. |
| `test_image_url`      | String?     | Uploaded request slip / image. |
| `result_link`         | String?     | External results URL (set at `done`). |
| `result_note`         | String?     | Free-text result summary. |
| `result_file_urls`    | String[]    | Attached result PDFs/images. |
| `poveon_amount`       | Decimal?    | Poveon commission for this request. |
| `lab_revenue_amount`  | Decimal?    | Lab's revenue after commission. |
| `is_paid_to_poveon`   | Boolean     | Commission settlement flag. |
| `created_at`          | DateTime    | |
| `seen_at`             | DateTime?   | Set when status → `seen`. |
| `completed_at`        | DateTime?   | Set when status → `done`. |

**Result delivery:** `POST /api/requests/send-results` accepts any of
`result_link`, `result_note`, `result_file_urls`, flips the request to `done`,
and emails the doctor and/or patient.

---

## 4. Doctors & per-encounter charging

### `DoctorProfile` — `doctor_profiles`
A doctor/professional account (natural key: `email`).

| Field                       | Type      | Notes |
|-----------------------------|-----------|-------|
| `email`                     | String PK | |
| `prefix`, `full_name`       | String?   | e.g. "Dr.", "Ada Obi". |
| `specialty`                 | String?   | |
| `phone`                     | String?   | |
| `hospitals`                 | String[]  | Affiliations. |
| `pin_hash`                  | String?   | 4-digit portal PIN (SHA-256). |
| `bank_name` / `bank_code` / `account_number` / `account_name` | String? | Payout bank (Paystack-verified). |
| `claimed`                   | Boolean   | `false` = pre-created by a marketer, not yet verified. |
| **Encounter charging:**     |           | |
| `consultation_fee`          | Decimal?  | Single-encounter fee (≥ ₦1,000). |
| `retainer_monthly`          | Decimal?  | Optional monthly retainership fee. |
| `retainer_yearly`           | Decimal?  | Optional yearly retainership fee. |
| `encounter_slug`            | String?   | Unique short link handle → `/d/{slug}`. |
| `paystack_subaccount_code`  | String?   | Subaccount for the 80/20 split payout. |
| `avatar_url`                | String?   | Profile photo on the encounter page. |
| `encounter_theme`           | String?   | Colour theme id for the encounter page. |
| `encounter_show_workplace`  | Boolean   | Show/hide hospitals on the page. |

### `Encounter` — `encounters`
A paid screening a patient requests via a doctor's link (`/d/{slug}`): AI intake,
optional photos, then payment. Payment splits **80% doctor / 20% Poveon** through
the doctor's Paystack subaccount.

| Field                | Type      | Notes |
|----------------------|-----------|-------|
| `id`, `code`         | String    | `code` e.g. `ENC-8X4K29Q`. |
| `doctor_email`       | String    | → `DoctorProfile`. |
| `patient_*`          | String/Int| name, email, phone, age, sex. |
| `image_urls`         | String[]  | Optional photos. |
| `conversation`       | Json      | AI intake `[{role, content}]`. |
| `ai_summary`         | String?   | Clinical summary for the doctor. |
| `plan_type`          | String    | `single` \| `monthly` \| `yearly`. |
| `status`            | String    | `awaiting_payment` → `new` → `in_review` → `responded` → `closed`. |
| `doctor_note`        | String?   | Doctor's reply to the patient. |
| `coupon_code` / `discount_percent` | String?/Int? | Applied discount. |
| `amount_paid`        | Decimal?  | Total charged (after discount). |
| `doctor_share`       | Decimal?  | 80%. |
| `poveon_share`       | Decimal?  | 20%. |
| `payment_reference`  | String?   | Paystack reference (unique). |
| `paid_at`, `responded_at` | DateTime? | |

### `DoctorPatient` — `doctor_patients`
A patient in a doctor's network with retainership status. Powers the doctor's
"Patients" view and the public trust-badge count.
Fields: `doctor_email`, `patient_email`, `subscription_type` (`none|monthly|yearly`),
`subscription_expires_at`, `total_paid` (doctor's share to date), `encounter_count`.
Unique on `(doctor_email, patient_email)`.

### `EncounterCoupon` — `encounter_coupons`
Per-doctor discount codes: `code` (uppercase), `percent_off` (1–90), `active`,
`times_used`. Unique on `(doctor_email, code)`.

---

## 5. Patients

### `PatientProfile` — `patient_profiles`
Global patient record (natural key: `email`) used for auto-fill across lab
requests and encounters: `name`, `phone`, `dob`, `sex`, `address`, `pin_hash`.

### `PatientOtp` / `PatientSession`
Email-OTP login codes and active portal sessions (cookie `patient_token`).

---

## 6. Hospitals & referrals

- `Hospital` — referral-network hospitals (email, phone, address, state, specialties, `pin_hash`).
- `HospitalDoctor` — doctors linked to a hospital.
- `HospitalOtp` / `HospitalSession` — hospital portal auth.
- `Referral` — a patient referral from one doctor/hospital to another (patient
  details, `from_hospital`, `to_hospital_id`, `specialty`, `urgency`,
  `clinical_note`, `status`, `response_note`).
- `ReferralEvent` — referral timeline (status changes, notes).

---

## 7. Marketers (affiliate / referral growth)

- `Marketer` — `name`, `email`, unique `code`, `pin_hash`, `suspended`.
- `DoctorMarketerLink` — first-touch attribution: one marketer owns a doctor email.
- `LabMarketer` — marketers assigned to a specific lab.
- `MarketerOtp` / `MarketerSession` — marketer portal auth.

---

## 8. Async dermatology consults

### `SkinConsult` — `skin_consults`
Self-serve teledermatology (`/skin`): patient uploads photos, AI intake, optional
paid flow. Fields mirror `Encounter` (patient details, `image_urls`, `conversation`,
`ai_summary`, `status`, payment fields). Reviewed by an admin/dermatologist.

---

## 9. Knowledge base & catalog matching

- `KbTest` — canonical tests with synonyms used to normalise lab catalogs.
- `TestKnowledgeBase` / `LabTestKnowledgeBaseMapping` — canonical test KB and the
  mapping of a lab's catalog names to canonical entries.
- `UnmappedTest` — request test names that couldn't be matched to a lab catalog.
- `LabSynonymGenerationJob` / `…TestResult` — background synonym-generation jobs.

---

## 10. Auth, sessions & system

- `AdminUser` — admins (links Supabase auth `user_id`).
- `DoctorOtp` / `DoctorSession` — doctor portal auth (cookie `doc_token`).
- `LabOtp` — lab password-reset / verify codes.
- `SmsLog` / `ApiLog` — SMS delivery and API call logs.
- `PriceChangeLog` — audit of lab price-list changes.
- `LabAgreement` / `LabAgreementInvite` — onboarding agreement signing.
- `SystemSetting` — global key/value settings, e.g.:
  - `default_request_price` — fallback charge for image-only requests.
  - `skin_consult_price`, `skin_consult_admin_email` — dermatology consult config.
  - `support_email` — where dashboard help/feedback is routed (default `spendbox@gmail.com`).

---

## 11. Money flows at a glance

| Flow                  | Mechanism                                                                 |
|-----------------------|---------------------------------------------------------------------------|
| Lab commission        | Computed per `Request` at `seen` (`poveon_amount` / `lab_revenue_amount`). Tracked for settlement. |
| Lab wallet top-ups    | Paystack **DVA** → `/api/paystack/webhook` → `LabWalletCredit` (idempotent on `reference`). |
| Doctor encounters     | Paystack **split via subaccount** — 80% to the doctor's bank, 20% to Poveon, at charge time. |
| Doctor payouts        | Paystack settles subaccount balance **T+1 working day**; tracked via the Settlement API and `settlement.success` webhook. |

---

_Last updated: June 2026. Generated from `prisma/schema.prisma`._
