# Poveon Health - Project Context & Architecture

## Application Overview
**Poveon Health** is a laboratory test request platform that connects:
- **Patients**: Can self-serve request lab tests
- **Doctors**: Can submit test requests on behalf of patients
- **Labs**: Partner laboratories that fulfill requests
- **Admins**: Dashboard for managing catalogs, labs, and requests

---

## Core Features

### 1. Patient Self-Service Request Flow
- Route: `/` (index page with form)
- Features:
  - Patient selects lab → selects tests → enters details → submits request
  - Health Assistant AI that recommends tests based on symptoms
  - Email confirmation sent to patient (if provided)
  - SMS sent to patient with request code
  - Multi-step form: Step 1 (Services) → Step 2 (Details) → Step 3 (Review)

### 2. Doctor Request Flow
- Route: `/` (same form, different mode)
- Features:
  - Doctor selects patient lab → selects tests → enters patient details
  - Same health assistant feature
  - Email confirmation to doctor

### 3. Unique Lab Pages
- Route: `[labSlug]` - Dynamic lab pages
- Features:
  - Branded page for each lab
  - Lab hero section with logo/branding
  - Request form pre-filled with lab ID
  - Health assistant works per-lab catalog

### 3b. Care Plan (`/consults`)
An annual subscription for people living with **hypertension** or **diabetes**.
It runs on the **patient portal's own identity** — enrolment is keyed on the
patient's email, so anyone we already hold an email for (a lab request, a
referral) enrols from their dashboard without a second account.

- `/consults` is a landing page whose one form creates (or signs into) a Poveon
  account with an email and a 4-digit PIN — after that, no emailed codes
- Enrolment itself is a **popup in `/dashboard`** (Care Plan tab), pre-filled
  from the patient's profile or their most recent lab request, with consent on
  the final step
- One yearly payment (price set by admin, default ₦10,000) via Paystack
- The **care code is only issued when the payment clears**, and the plan goes
  inactive the moment its year runs out and isn't renewed
- Members get discounts at partner labs and pharmacies plus an allowance of
  asynchronous messages to a doctor (default 40 per year)
- The platform assigns each new member to the accepting doctor carrying the
  fewest live members and still under their own yearly cap
- The doctor's share (default ₦6,000 per member-year) is held as a pending
  entitlement and released into their wallet in monthly instalments
  (pool ÷ release months); a member who leaves stops accruing
- Admin controls price, doctor share, allowance, caps and discounts, and runs
  the monthly release
- Partner **pharmacies** are created by an admin, sign in with an emailed code
  at `/pharmacy-login`, verify care codes and track their own regulars

Routes: `/consults` (account creation), `/dashboard?tab=care` (the plan itself),
`/consults/paid` (payment return), `/pharmacy-login`, `/pharmacy-dashboard`.
Doctor side lives in the Care Plan tab of `/doc-login/dashboard`; admin side in
the Care Plan and Pharmacies tabs.

**Doctor credentialling:** a doctor cannot be assigned care-plan members until
an admin approves them. They file MDCN number, annual practising licence (with
a scan), qualifications and optional ID/CV under Care Plan → Credentials; an
admin reviews it in Care Plan → Doctor approvals and approves, rejects with a
reason, or revokes. `pickDoctorForMember` only ever considers
`consult_approved` doctors. Credential documents live in a **private** Supabase
bucket and are opened through short-lived signed URLs.

**Test & medication plans:** an approved doctor schedules tests
(`consult_test_orders`, with a recurrence that re-schedules itself when marked
done) and records medication (`consult_prescriptions`) per member. Both show on
the member's own dashboard alongside the reminder that their care code
discounts them.

**Installable (PWA):** `public/manifest.webmanifest` + `public/sw.js`, registered
by `components/pwa/InstallPrompt.tsx`, which also offers "add to home screen"
(the real prompt on Android, manual instructions on iOS). The app opens on
`/signin`, which forwards a returning user to whichever portal they last used
(patient or medical professional) and otherwise offers the choice; both login
pages carry a `PortalSwitch` to cross over. The service worker
caches build assets and an `/offline` fallback only — never `/api`, and never
page HTML, so nothing personal is replayable from a shared phone.

**Schema safety net:** `scripts/run-migration.mjs` runs at build time and every
step is `continueOnError`, so a failed statement is logged as "already applied"
and the table silently never appears (this is how `pharmacy_otps` went missing
in production). The care-plan routes therefore call
`ensureCarePlanSchema()` defensively, the same way the doctor-charging routes
call `ensureEncounterSchema()`. Keep care-plan migration steps to **one
statement each** — a combined block fails as a unit.

### 4. Public Pages
- `/` - Landing page (the old `/home` route now redirects here)
- `/about` - Company mission and values
- `/contact` - Contact form and info
- `/security` - Security and privacy info

### 5. Lab Test Catalog & Admin Dashboard
- Test catalog modal is used for:
  1. **Viewing/browsing** all available tests in the catalog
  2. **Bulk editing or creating** tests
  3. **Uploading/importing** test data from CSV/spreadsheet
  4. **Syncing** with lab catalogs (updating from external sources)
- Categories are **dynamic** - depend on what's in the CSV/spreadsheet or lab catalog (can range from 10-100+ categories)
- Supports **single-select filtering** by category via dropdown
- Progress tracking for all operations (upload, bulk edit, sync)
- Minimized state: **Read-only** with progress indicator
- Minimized state **persists across all pages**
- Opens as **overlay** on both mobile and desktop (not full-screen on mobile)

---

## Database & Data Models

### Key Tables
- **Lab** - Laboratory information (name, address, phones, categories, offered tests)
- **Request** - Lab test requests (patient/doctor info, tests, results)
- **LabOfferedTest** - Tests offered by each lab (raw_name, category, synonyms, pricing)
- **LabBranch** - Multiple branches of the same lab

### Important Fields
- `lab.service_categories` - Array of test categories offered
- `labOfferedTest.category_label` - Category of each test
- `request.doctor_email` - NULL for self-service patients (distinguishes self-service from doctor-referred)

---

## SMS Integration

### Current Status: **Twilio** (Switched from Sendchamp)
- Environment Variables:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`
- SMS sent to patients when they submit a request
- Fire-and-forget pattern with `.then()/.catch()` logging
- Phone format: E.164 (e.g., +2348001234567)

---

## Email Integration

### Email Provider: **Resend**
- Environment Variable: `RESEND_API_KEY`
- Email templates:
  - `patientRequestCode` - Sent to patients with request code (has `isSelfService` parameter)
  - `labNewRequest` - Sent to lab when request received
  - `doctorRequestConfirmation` - Sent to doctor when request submitted

### Self-Service Email Fix
- For self-service patients: "Your lab test request has been received..."
- For doctor-referred: "Your doctor has sent a laboratory test request..."
- Parameter: `isSelfService: true` passed in patient-create route

---

## Health Assistant Feature

### AI-Powered Test Recommendation
- Route: `/api/labs/[labId]/assistant`
- Provider: OpenAI GPT-4o-mini
- Function:
  - Takes patient symptoms/concerns
  - Recommends tests from **lab's actual catalog** (no hallucinating)
  - Automatically adds suggested tests to patient's selection
  - Works in both patient and doctor modes

### Rules
- **Only suggests tests that exist in the lab's catalog**
- Falls back to asking patient to contact lab if no catalog available
- Provides 1-4 test suggestions per query

---

## UI Components & Design System

### Key Components
- **TestTagInput** - Test selection input with:
  - Catalog search with dropdown
  - Free-text entry for custom tests
  - Low-confidence indicator for non-catalog tests
  - Subtle floating hint "Press ⏎ to add"

- **PatientRequestForm** - Multi-step form with:
  - 3 steps: Services → Details → Review
  - Health Assistant toggle
  - Progressive field reveal (phone → name → email → age)
  - Floating action bar (fixed bottom)
  - pb-32 padding to prevent content overlap
  - Health assistant chat with max-h-[50vh]

- **RequestFormToggle** - Dropdown to switch between Professional/Patient modes
  - Removed "Can switch anytime" hint

### Design System
- Primary color: `medical-600` (#0259a0)
- Tailwind CSS with custom animations (blob, fade-in, slide-up)
- Mobile-first responsive design
- Glassmorphic cards (glass-card class)

---

## API Endpoints

### Patient Self-Service Request
- `POST /api/requests/patient-create`
- Input: lab_id, patient_phone, patient_email, tests, condition, etc.
- Output: code, requestId, lab info
- Features:
  - Generates unique request code
  - Sends SMS to patient
  - Sends email to patient (if provided)
  - Fire-and-forget pattern with logging

### Health Assistant
- `POST /api/labs/[labId]/assistant`
- Input: messages (chat history)
- Output: message, suggestions (test names)
- Uses lab's actual test catalog for suggestions

---

## Known Issues & Fixes Applied

### Fixed
✅ Patient email not being sent - Added proper await and logging
✅ Email template wrong for self-service - Added isSelfService parameter
✅ Test input hint too big - Changed to subtle floating "Press ⏎"
✅ Continue button overlapped by health assistant - Added pb-32 padding
✅ Health assistant hallucinating tests - Now only suggests from lab's catalog
✅ SMS hanging without response - Added 5s timeout, switched to Twilio
✅ Sendchamp not responding - Removed Sendchamp, switched to Twilio
✅ Learn More button on home didn't work - Fixed to scroll to #features

### Pending/In Progress
- Admin test catalog modal improvements (in progress)

---

## Environment Variables Checklist
- `RESEND_API_KEY` ✅
- `TWILIO_ACCOUNT_SID` ✅
- `TWILIO_AUTH_TOKEN` ✅
- `TWILIO_PHONE_NUMBER` ✅
- `OPENAI_API_KEY` ✅
- `NEXT_PUBLIC_APP_URL` ✅
- Database connection string ✅

---

## File Structure Reference

Key files:
- `/src/app/page.tsx` - Index page (form creation)
- `/src/components/home/LandingPage.tsx` - Landing page
- `/src/app/[labSlug]/page.tsx` - Dynamic lab pages
- `/src/components/PatientRequestForm.tsx` - Main form component
- `/src/components/RequestFormToggle.tsx` - Mode switcher
- `/src/components/ui/TestTagInput.tsx` - Test selection input
- `/src/lib/sms/twilio.ts` - SMS provider
- `/src/lib/email/templates.ts` - Email templates
- `/src/app/api/labs/[labId]/assistant/route.ts` - Health assistant API
- `/src/app/api/requests/patient-create/route.ts` - Patient request API

---

## Doctor Per-Encounter Charging (`/d/[slug]`)

A doctor shares a short link (`/d/dr-ada-obi`). A patient enters their email (auto-fills
saved name/phone/age/sex from `PatientProfile`), optionally uploads photos, is screened by
an AI intake chat, then chooses a **single encounter**, **monthly retainership**, or
**yearly retainership** and pays. Payment splits automatically **80% doctor / 20% Poveon**
via a Paystack **subaccount** (created from the doctor's verified bank details when they
set pricing). On a verified payment the doctor is emailed the full Q&A + photos and the
patient gets a confirmation; the patient is added to the doctor's network (with retainer
expiry tracked).

- **Patient page:** `src/app/d/[slug]/page.tsx` + `src/components/encounter/EncounterFlow.tsx`
  (trust badge shows the doctor's managed-patient count). Payment return: `src/app/d/paid`.
- **Public APIs:** `src/app/api/encounter/{[slug],lookup,upload,chat,submit,verify}/route.ts`
- **Doctor dashboard:** "Charging" tab → `src/components/doctor/DoctorEncounterSection.tsx`
  (Revenue / Encounters / Patients / Pricing). Doctors set fees + payout bank, get their
  share link, see revenue, and send notes to patients. APIs: `src/app/api/doc-login/{pricing,encounters,encounters/[id]/note}`.
- **Admin:** "Doctor Encounters" tab → `src/components/admin/AdminEncountersTab.tsx`
  (gross, Poveon 20% revenue, doctor payouts, per-doctor breakdown). API: `src/app/api/admin/encounters`.
- **Core logic:** `src/lib/doctor-encounter.ts` (pricing, slug, subaccount, split, notify, AI summary).
- **Schema:** `DoctorProfile` gains `consultation_fee/retainer_monthly/retainer_yearly/encounter_slug/bank_code/paystack_subaccount_code`; new `Encounter` and `DoctorPatient` models. Production columns/tables added in `scripts/run-migration.mjs`.
- **Webhook backup:** `/api/paystack/webhook` finalises `doctor_encounter` payments if the
  patient never returns to the callback page (mirrors the skin-consult path).

---

## Doctor Perks & Free Rides (`/logistics`, `/rider`)

Admins grant doctors **perks** (currently a **free ride** to a partnered lab), scoped
per-lab and limited by a use count. A doctor may hold several perks; a free ride can
be available for Lab A but not Lab B.

- **Assigning perks / partners / tracking:** Admin → "Perks & Rides" tab →
  `src/components/admin/AdminPerksTab.tsx`. Three sub-tabs: assign doctor perks,
  manage logistics partners (add + assign to labs + add riders count), and track
  every ride with a manually-set **cost** (what Poveon pays the partner) and a
  paid/unpaid flag. APIs: `src/app/api/admin/{perks,perks/[id],rides,rides/[id],logistics,logistics/[id]}`.
- **Doctor redemption:** in the doctor request form (`DoctorRequestForm.tsx`, step 3)
  a small opt-in prompt appears when `POST /api/perks/available` returns a perk for
  that doctor+lab. The doctor confirms/edits the patient's name, **phone (country-code
  input)** and **email (required — the arrival code is emailed there)**, enters a
  pickup address, and must pass a **login-code gate** (`POST /api/perks/doctor-pin`,
  action `verify`): the doctor **must already have a login code** (set up in the
  doctor portal `/doc-login`) and enters it here — verifying it starts a `doc_token`
  session. Doctors without a code are pointed to the portal to create one first.
  The ride is created
  as part of `POST /api/requests/create` (`free_ride`, `free_ride_perk_id`,
  `ride_pickup_address`) — which server-side only redeems when a valid doctor session
  matches. Redemption logic + notifications live in `src/lib/rides.ts`. On success the
  doctor is told the patient received 2 emails (request + free-ride/arrival code), with
  a 3rd (rider phone) to follow.
- **Notifications:** patient (free-ride details, secret arrival code, a note that the
  ride is *scheduled* not immediate, and the **logistics company's contact details**),
  doctor (confirmation with the same logistics-company contacts), lab (`request_email`,
  order carries a free ride), and the lab's assigned logistics partner(s). A second
  patient email carries the rider's phone once a rider is assigned. Templates:
  `ride*`/`portalOtpEmail`/`riderInviteEmail` in `src/lib/email/templates.ts`.
- **Logistics partner portal** (`/logistics`, email-OTP, cookie `logi_token`): a
  mobile-friendly dashboard of pending/assigned rides for their labs; they assign a
  rider (patient is emailed the rider's phone) and manage their own riders. Riders and
  partners only ever see the patient's **first name, phone and pickup location**.
  APIs: `src/app/api/logistics-login/*`, `src/app/api/logistics/*`; auth helper
  `src/lib/logistics-auth.ts`.
- **Rider portal** (`/rider`, email-OTP, cookie `rider_token`): a minimal dashboard
  where the rider ends a trip by entering the patient's **arrival code**. Patients are
  told not to share the code until they reach the lab, so a correct code confirms
  arrival. APIs: `src/app/api/rider-login/*`, `src/app/api/rider/*`; helper
  `src/lib/rider-auth.ts`.
- **Lab view:** the lab dashboard has a **"Free Rides"** panel (Operations section →
  `mainView === "rides"`, `GET /api/lab/rides`) listing patients arriving via a free
  ride and each ride's progress (pending → assigned → completed), plus a "Free Ride"
  badge on the flagged request.
- **Schema:** `DoctorPerk`, `RidePerk`, `LogisticsPartner`, `LogisticsPartnerLab`,
  `Rider`, and `*Otp`/`*Session` models; `Request.has_free_ride` flag. The redemption
  window is **7 days** everywhere (`RIDE_REDEEM_DAYS` in `src/lib/rides.ts`).
  Production tables/columns added in `scripts/run-migration.mjs`.

## Next Tasks
1. Improve admin test catalog modal (current task)
   - Add category filtering (dynamic dropdown)
   - Make mobile-friendly overlay
   - Add minimized floating tab with persistent state
   - Show progress for all operations
   - Professional UI/UX
