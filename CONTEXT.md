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

### 4. Public Pages
- `/home` - Beautiful landing page
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
- `/src/app/home/page.tsx` - Landing page
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

## Next Tasks
1. Improve admin test catalog modal (current task)
   - Add category filtering (dynamic dropdown)
   - Make mobile-friendly overlay
   - Add minimized floating tab with persistent state
   - Show progress for all operations
   - Professional UI/UX
