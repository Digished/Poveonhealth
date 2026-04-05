# Patient Mode & SMS Authentication — Implementation Plan

**Feature Set:** Lab Request Submission Toggle + Phone-Based Patient Auth  
**Date:** 2026-04-05  
**Status:** Approved for Development

---

## Overview

Two interconnected features:

1. **Patient Mode Toggle** — Lab request pages gain a toggle so users can submit as a *Medical Professional* (existing flow) or as a *Patient* (new self-service flow with an AI-powered Health Assistant and category browsing).
2. **Phone-First SMS Auth** — Patients authenticate with their phone number + SMS OTP (via Termii) when filling the form. They also receive an SMS confirmation with their request code after submission.

---

## Scope

| Page | Professional Toggle | Patient Toggle |
|------|--------------------|--------------------|
| Home page (`/`) | Existing `DoctorRequestForm` | New `PatientRequestForm` |
| Unique lab page (`/[labSlug]`) | Existing `DoctorRequestForm` | New `PatientRequestForm` |

---

## Feature 1: Patient Mode Toggle

### 1.1 Toggle UI

A clearly styled toggle/tab strip appears above the form on both the home page and unique lab pages:

```
[ For Medical Professionals ]  [ For Patients ]
```

- Defaults to **Medical Professionals** (preserves existing UX for the primary user base).
- Switching to *Patient* unmounts the professional form and mounts `PatientRequestForm`.
- The selected mode persists in local state only (no URL param needed).

---

### 1.2 Professional Mode

**No changes.** The existing `DoctorRequestForm` (4-step flow) remains untouched for professional submissions. Email-first patient lookup in Step 4 stays as-is.

---

### 1.3 Patient Mode — `PatientRequestForm`

A new, simplified form component designed for patients submitting on their own behalf. No doctor fields. The patient chooses how to identify the tests they need via one of two paths:

#### Path A: Health Assistant Chat

An interactive chat interface powered by **OpenAI** (already integrated in the codebase).

**How it works:**
- Patient types a concern in plain language (e.g. *"I want to check for prostate cancer"*).
- The Assistant replies with relevant test suggestions drawn **only from that specific lab's catalog** (`LabOfferedTest` for the selected lab).
- Suggestions are returned in a structured format — each test is a selectable chip the patient can confirm or deselect.
- The conversation can go multiple turns (clarifications, follow-ups).
- Patient finalises their selection and proceeds.

**Important constraints hardcoded into the system prompt:**
- Only suggest tests that exist in the selected lab's catalog. Never invent tests.
- Never use the word "AI". Refer to self as "Health Assistant" or just "Assistant".
- Prepend every session with a disclaimer the user must acknowledge:
  > *"This service is for informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional."*
- Do not provide diagnoses or interpretations of results.

**API endpoint:** `POST /api/labs/[labId]/assistant`  
- Accepts message history + selected lab ID.  
- Fetches the lab's `LabOfferedTest` records and injects them into the system prompt context.  
- Streams the response back to the client.

#### Path B: Browse by Category

A visual grid of **service categories** configured per lab. Patient taps a category, sees available tests within it, and selects what they want.

Default categories (seeded for all labs, can be customised per lab):
- MRI
- CT Scan
- Ultrasound
- X-Ray
- Mammogram
- Cardiac
- ECG
- Blood & Lab Tests
- Wellness & Screenings
- Biopsy
- Others

Patient can also type additional free-text requests in an "Additional Requests" textarea before submitting.

Both paths feed into the same final review step.

---

### 1.4 Patient Form Steps

| Step | Content |
|------|---------|
| 1 | **Lab Selection** — same as professional Step 1 (pre-filled if on a lab-specific page). Branch selection included. |
| 2 | **Test Selection** — toggle between *Health Assistant Chat* and *Browse Categories*. Finalise test list. Additional notes textarea. |
| 3 | **Patient Details** — phone number (primary, with SMS OTP verification), name, DOB, sex. Email optional. |
| 4 | **Review & Submit** |

---

### 1.5 Request Creation — Doctor Fields for Self-Service

When a patient submits via the patient form, the following doctor-related fields are populated with placeholder values so the existing `Request` schema is satisfied without a breaking change:

| Field | Value |
|-------|-------|
| `doctor_name` | `"Self Service"` |
| `doctor_prefix` | `""` (empty) |
| `doctor_email` | `"self-service@poveonhealth.com"` *(or a platform constant)* |
| `doctor_hospital` | `""` |
| `doctor_bank_name` | `null` |
| `doctor_account_number` | `null` |

The lab dashboard and admin panel can filter or label these requests as **"Self-Service"** in the UI for clarity.

---

### 1.6 LabServiceCategory — New Database Model

```prisma
model LabServiceCategory {
  id            String   @id @default(uuid())
  lab_id        String
  name          String
  icon          String?  // optional emoji or icon key
  display_order Int      @default(0)
  is_active     Boolean  @default(true)
  created_at    DateTime @default(now())

  lab Lab @relation(fields: [lab_id], references: [id], onDelete: Cascade)
}
```

**Seeding:** On migration, all existing labs receive the 11 default categories listed above, all set to `is_active: true`.

---

### 1.7 Admin Dashboard — Category Management

A new **"Service Categories"** section is added to the lab detail panel in the admin dashboard (same location as the price list manager). Features:

- Add new category (name + optional icon)
- Toggle active/inactive per category
- Drag to reorder (display order)
- Delete category

This allows each lab to offer only the service types relevant to them (e.g. a blood-only lab might disable MRI, CT Scan, Ultrasound, etc.).

**API endpoints:**
- `GET /api/admin/labs/[id]/categories` — list categories for a lab
- `POST /api/admin/labs/[id]/categories` — create category
- `PATCH /api/admin/labs/[id]/categories/[catId]` — update (name, icon, order, active)
- `DELETE /api/admin/labs/[id]/categories/[catId]` — delete

---

## Feature 2: Phone-First SMS Authentication

### 2.1 Scope

| Context | Auth Method |
|---------|------------|
| Patient filling form (both home + lab page) | Phone number + SMS OTP (new) |
| Doctor filling form (Step 4 patient lookup) | Email lookup — **unchanged** |
| Doctor portal login | Email OTP — **unchanged** |
| Lab dashboard login | Supabase Auth — **unchanged** |
| Admin login | Supabase Auth — **unchanged** |

---

### 2.2 SMS Provider — Termii

**Why Termii:**
- Nigerian company; best local delivery rates for NGN mobile numbers (MTN, Airtel, Glo, 9mobile).
- OTP-specific API with telco-approved message templates (reduces blocking).
- Simple REST API, no SDK required.
- Cost-effective at scale vs Twilio for Nigerian traffic.

**Configuration (environment variables to add):**
```env
TERMII_API_KEY=your_api_key_here
TERMII_SENDER_ID=YourSenderName   # Approved alphanumeric sender ID
TERMII_BASE_URL=https://v3.api.termii.com
```

**Utility file:** `src/lib/sms/termii.ts`
- `sendOtp(phone: string, code: string): Promise<void>`
- `formatPhone(phone: string): string` — ensures E.164 format for Nigerian numbers

---

### 2.3 Phone OTP Flow (Patient Form Step 3)

```
Patient enters phone number
        │
        ▼
POST /api/patient/send-phone-otp
  - Validates phone format (E.164)
  - Generates 6-digit OTP
  - Hashes & stores in PatientPhoneOtp (10-min TTL, max 3 pending per phone)
  - Sends SMS via Termii: "Your Poveon Health verification code is: XXXXXX"
        │
        ▼
Patient enters 6-digit code
        │
        ▼
POST /api/patient/verify-phone-otp
  - Validates code against hash
  - Marks OTP used
  - Looks up PatientProfile by phone (if exists, pre-fills name/DOB/sex)
  - Creates/refreshes PatientSession (7-day, httpOnly cookie)
  - Returns { verified: true, profile?: PatientProfile }
        │
        ▼
Patient completes remaining details → Review → Submit
```

---

### 2.4 New Database Models

```prisma
model PatientPhoneOtp {
  id         String   @id @default(uuid())
  phone      String
  code_hash  String
  expires_at DateTime
  used       Boolean  @default(false)
  created_at DateTime @default(now())
}
```

**`PatientProfile` changes:**
- Add `phone` as a unique, indexed field (currently stored but not unique).
- Keep `email` as-is (not removed — still used in professional form for patient lookup).
- `PatientSession` gains an optional `patient_phone` field so sessions can be keyed by phone when email is absent.

```prisma
// PatientProfile — add field:
phone String? @unique

// PatientSession — add field:
patient_phone String?
```

> **Migration note:** Existing profiles may have duplicate phone values (phone wasn't unique before). The migration script must deduplicate (keep most recently updated profile) before adding the unique constraint.

---

### 2.5 SMS Confirmation on Request Creation

When a request is successfully created via `POST /api/requests/create`, in addition to the existing emails, an SMS is sent to the patient:

**Message template:**
```
Your lab request at [Lab Name] has been submitted.
Request Code: [CODE]
Keep this code to track your request.
- Poveon Health
```

This is non-blocking (same pattern as existing email sends — failures are logged but don't affect the API response).

**Implementation location:** `src/app/api/requests/create/route.ts` — add SMS call alongside existing `sendPatientRequestCode()` email call.

---

## Implementation Order

| # | Task | Touches |
|---|------|---------|
| 1 | Add Termii utility (`src/lib/sms/termii.ts`) | New file |
| 2 | Add `PatientPhoneOtp` model + migrate `PatientProfile.phone` to unique | `prisma/schema.prisma` |
| 3 | Build `POST /api/patient/send-phone-otp` and `verify-phone-otp` APIs | New API routes |
| 4 | Add SMS notification in `requests/create` route | `src/app/api/requests/create/route.ts` |
| 5 | Add `LabServiceCategory` model + seeding script | `prisma/schema.prisma` + seed |
| 6 | Build category management APIs (`/api/admin/labs/[id]/categories`) | New API routes |
| 7 | Add category management UI in admin lab panel | `src/components/AdminDashboard.tsx` |
| 8 | Build `PatientRequestForm` component (phone OTP step + category browser) | New component |
| 9 | Build `AssistantChat` component (OpenAI streaming, lab catalog context) | New component |
| 10 | Build `POST /api/labs/[labId]/assistant` endpoint | New API route |
| 11 | Add mode toggle to home page and unique lab page | `src/app/page.tsx`, `src/app/[labSlug]/page.tsx` |
| 12 | Label "Self Service" requests in lab dashboard UI | `src/components/LabDashboard.tsx` |

---

## Open Questions / Decisions Needed

- [ ] **SMS sender ID**: What name should appear as the SMS sender? (e.g. "PoveonHealth", "PoveonHlth" — max 11 chars for alphanumeric). Must be pre-approved with Termii.
- [ ] **Self-service email constant**: Confirm the placeholder email for self-service requests (e.g. `self-service@poveonhealth.com`) — this address should not receive emails.
- [ ] **Patient PIN on self-service**: Currently patients set a 4-digit PIN after first login. Should self-service patients also be prompted to set a PIN, or skip that step?
- [ ] **Duplicate phone migration**: If two `PatientProfile` rows share the same phone number, which one wins? (Suggested: keep the one with the most complete profile / most recent `updated_at`.)
- [ ] **Lab page category fallback**: If a lab has no categories configured yet, should the patient form show all 11 defaults or prompt admin to configure first?

---

## Out of Scope (This Phase)

- Patient-facing request tracking portal (view request status by code)
- Lab-to-patient SMS updates (e.g. when results are ready)
- Professional form phone-first auth
- Health Assistant in professional mode
- WhatsApp OTP as alternative channel
