# Patient Mode & SMS Authentication — Implementation Plan

**Feature Set:** Lab Request Submission Toggle + Phone-Based Patient Auth  
**Date:** 2026-04-05  
**Status:** Approved for Development

---

## Overview

Two interconnected features:

1. **Patient Mode Toggle** — Lab request pages gain a toggle so users can submit as a *Medical Professional* (existing flow) or as a *Patient* (new self-service flow with a Health Assistant and category browsing). No OTP or account needed for self-service — just name, phone, and tests.
2. **SMS Confirmation** — Patients receive an SMS with their unique request code after submission (via Termii). No auth OTP required for self-service.

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
- UI must be visually consistent with the existing form design (same card style, spacing, typography, colours).

---

### 1.2 Professional Mode

**No changes.** The existing `DoctorRequestForm` (4-step flow) remains untouched for professional submissions. Email-first patient lookup in Step 4 stays as-is.

---

### 1.3 Patient Mode — `PatientRequestForm`

A new, simplified form component designed for patients submitting on their own behalf. **No doctor fields. No OTP. No account creation.** Maximum 3 steps.

The patient chooses how to identify the tests they need via one of two paths:

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

If a lab has no categories configured yet, the category browser shows a clear message:
> *"Service categories have not been set up for this lab yet. Please contact the lab directly or use the Health Assistant above."*

Patient can also type additional free-text requests in an "Additional Requests" textarea before proceeding.

Both paths feed into the same patient details step.

---

### 1.4 Patient Form Steps

Simple, 3-step flow:

| Step | Content |
|------|---------|
| 1 | **Lab & Test Selection** — Lab selection (pre-filled on lab-specific page) + branch. Then choose tests via *Health Assistant* or *Browse Categories*. Additional notes textarea at the bottom. |
| 2 | **Your Details** — Phone number (required), full name (required), age (optional). No OTP. No account. No PIN. |
| 3 | **Review & Submit** — Summary of lab, tests, and patient details. Single "Submit Request" button. |

**Step 1 is skipped** (lab pre-filled) on the unique lab page, so the patient lands directly on test selection.

---

### 1.5 Request Creation — Doctor Fields for Self-Service

When a patient submits via the patient form, doctor-related fields are left null/blank so the existing `Request` schema is satisfied without a breaking change:

| Field | Value |
|-------|-------|
| `doctor_name` | `"Self Service"` |
| `doctor_prefix` | `""` (empty string) |
| `doctor_email` | `null` |
| `doctor_hospital` | `null` |
| `doctor_bank_name` | `null` |
| `doctor_account_number` | `null` |

The lab dashboard and admin panel display these requests with a **"Self-Service"** badge for clarity.

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

## Feature 2: SMS Confirmation on Request Creation

### 2.1 Scope

No OTP or phone verification for self-service patients. The phone number is collected purely to:
1. Send the patient their request code via SMS after submission.
2. Allow the lab to contact the patient.

| Context | Auth Method |
|---------|------------|
| Self-service patient (patient form) | No auth — just name + phone, submit |
| Doctor filling form (Step 4 patient lookup) | Email lookup — **unchanged** |
| Doctor portal login | Email OTP — **unchanged** |
| Lab dashboard login | Supabase Auth — **unchanged** |
| Admin login | Supabase Auth — **unchanged** |

---

### 2.2 SMS Provider — Termii

**Why Termii:**
- Nigerian company; best local delivery rates for NGN mobile numbers (MTN, Airtel, Glo, 9mobile).
- Simple REST API, no SDK required.
- Cost-effective at scale vs Twilio for Nigerian traffic.

**Configuration (environment variables to add):**
```env
TERMII_API_KEY=your_api_key_here
TERMII_SENDER_ID=Poveon
TERMII_BASE_URL=https://v3.api.termii.com
```

**Utility file:** `src/lib/sms/termii.ts`
- `sendSms(phone: string, message: string): Promise<void>`
- `formatPhone(phone: string): string` — ensures E.164 format for Nigerian numbers

---

### 2.3 SMS Confirmation on Request Creation

When a request is successfully created via `POST /api/requests/create`, an SMS is sent to the patient's phone number:

**Message template:**
```
Hi [Name], your lab request at [Lab Name] has been submitted.
Request Code: [CODE]
Keep this code to track your request.
- Poveon Health
```

This is **non-blocking** (same pattern as existing email sends — failures are logged but never block the API response).

**Implementation location:** `src/app/api/requests/create/route.ts` — add SMS call alongside the existing `sendPatientRequestCode()` email call.

---

## Implementation Order

| # | Task | Touches |
|---|------|---------|
| 1 | Add Termii SMS utility (`src/lib/sms/termii.ts`) | New file |
| 2 | Add SMS confirmation in `requests/create` route | `src/app/api/requests/create/route.ts` |
| 3 | Add `LabServiceCategory` model + migration + seeding script | `prisma/schema.prisma` + seed |
| 4 | Build category management APIs (`/api/admin/labs/[id]/categories`) | New API routes |
| 5 | Add category management UI in admin lab panel | `src/components/AdminDashboard.tsx` |
| 6 | Build `POST /api/labs/[labId]/assistant` endpoint (OpenAI streaming, lab catalog context) | New API route |
| 7 | Build `PatientRequestForm` component (3 steps: test selection + details + review) | New component |
| 8 | Build `AssistantChat` sub-component (chat UI, streaming, disclaimer, selectable suggestions) | New component |
| 9 | Build `TestCategoryBrowser` sub-component (category grid, test selection, additional notes) | New component |
| 10 | Add mode toggle to home page and unique lab page | `src/app/page.tsx`, `src/app/[labSlug]/page.tsx` |
| 11 | Label "Self Service" requests in lab dashboard UI | `src/components/LabDashboard.tsx` |

---

## Resolved Decisions

| Question | Decision |
|----------|----------|
| SMS sender ID | `Poveon` (pre-approve with Termii) |
| Doctor email for self-service | `null` (blank) |
| Patient OTP / PIN for self-service | None — no auth required for self-service |
| Duplicate phone migration | Keep most recently updated `PatientProfile` |
| Category fallback (unconfigured lab) | Show message prompting admin to configure categories |

---

## Out of Scope (This Phase)

- Patient-facing request tracking portal (view request status by code)
- Lab-to-patient SMS updates (e.g. when results are ready)
- Professional form phone auth changes
- Health Assistant in professional mode
- WhatsApp OTP as alternative channel
- Patient account creation or login from the self-service form
