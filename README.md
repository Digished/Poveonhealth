# Poveon Health — Laboratory Request Platform

A production-ready web platform that allows doctors to send laboratory test requests to labs **without requiring doctor login**.

**Stack:** Next.js 14 · TypeScript · Tailwind CSS · Supabase Auth · Prisma ORM · Resend · Vercel

---

## 📁 Folder Structure

```
poveon/
├── .env.local.example
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── prisma/
│   └── schema.prisma           # DB schema — run `npm run db:push` to sync
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx             # Home — Doctor request form (public)
    │   ├── globals.css
    │   ├── lab-login/page.tsx
    │   ├── lab-dashboard/page.tsx
    │   ├── admin-login/page.tsx
    │   ├── admin/page.tsx
    │   ├── [labSlug]/page.tsx   # Lab-specific URL (e.g. /apexlabs) — skips lab selection
    │   ├── login/page.tsx       # Patient OTP login
    │   ├── dashboard/page.tsx   # Patient dashboard
    │   └── api/
    │       ├── labs/route.ts              # GET: Lab list for dropdown
    │       ├── lab/requests/route.ts      # GET: Lab's own requests
    │       ├── requests/
    │       │   ├── create/route.ts        # POST: Submit lab request
    │       │   ├── retrieve/route.ts      # POST: Retrieve by code
    │       │   └── update-status/route.ts # POST: Update status
    │       ├── patient/
    │       │   ├── send-otp/route.ts      # POST: Patient OTP login
    │       │   ├── verify-otp/route.ts    # POST: Verify OTP + create session
    │       │   ├── me/route.ts            # GET: Current patient session
    │       │   └── logout/route.ts        # POST: Destroy session
    │       └── admin/
    │           ├── create-lab/route.ts    # POST: Create new lab
    │           └── requests/route.ts      # GET: All requests + metrics
    ├── components/
    │   ├── DoctorRequestForm.tsx
    │   ├── SuccessScreen.tsx
    │   ├── LabDashboard.tsx
    │   ├── AdminDashboard.tsx
    │   └── ui/
    │       ├── Button.tsx
    │       ├── Input.tsx        # Input, Textarea, Select
    │       └── Badge.tsx        # StatusBadge, Badge
    ├── lib/
    │   ├── prisma.ts            # Prisma client singleton
    │   ├── supabase/
    │   │   ├── client.ts        # Browser client (auth only)
    │   │   └── server.ts        # Server + admin client (auth only)
    │   ├── types.ts
    │   ├── code-generator.ts
    │   └── email/
    │       ├── resend.ts
    │       └── templates.ts
    └── middleware.ts            # Route protection
```

---

## 🗄️ Database Setup — One Command, No SQL Editor

Poveon uses **Prisma** with Supabase's PostgreSQL. Instead of pasting SQL manually, you just run one command.

### Step 1: Get your connection strings from Supabase

1. Go to [app.supabase.com](https://app.supabase.com) → your project
2. **Project Settings → Database → Connection string**
3. You need two strings:
   - **Transaction pooler** (port `6543`) → set as `DATABASE_URL`
   - **Session pooler** (port `5432`) → set as `DIRECT_URL`

They look like:
```
postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true
postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:5432/postgres
```

### Step 2: Set up your `.env.local`

```bash
cp .env.local.example .env.local
# Fill in all values
```

### Step 3: Push the schema to your database

```bash
npm install
npm run db:push     # = npx prisma db push
```

That's it — Prisma creates all tables automatically. No SQL editor needed.

### Step 4: Create your first Admin user

This is a one-time step that still needs two small SQL commands:

1. Go to Supabase → **Authentication → Users → Add User**
2. Create a user with your admin email + password
3. Copy the user's UUID
4. Go to **SQL Editor** and run:

```sql
-- Add to admin_users table
INSERT INTO admin_users (user_id) VALUES ('YOUR-UUID-HERE');

-- Set role in Supabase Auth metadata
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE id = 'YOUR-UUID-HERE';
```

After this, all lab creation is handled through the Admin Dashboard UI — no more SQL.

---

## ⚙️ Environment Variables

Copy `.env.local.example` to `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # Keep secret — server-side only

# Prisma (from Supabase > Project Settings > Database)
DATABASE_URL=postgresql://postgres.xxxx:[pw]@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xxxx:[pw]@aws-0-region.pooler.supabase.com:5432/postgres

# Resend
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=Poveon Health

# App URL (set after first Vercel deploy)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# SMS (Termii)
TERMII_API_KEY=...

# WhatsApp (Twilio) — optional; omit to keep SMS/email only
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=+14155238886      # sandbox number, or your WhatsApp sender
```

See `.env.local.example` for the full list, including the WhatsApp message
template SIDs and per-channel send caps.

Notifications (request code, lab address, results, referrals) go out on
WhatsApp first and fall back to SMS — see
[docs/WHATSAPP_SETUP.md](docs/WHATSAPP_SETUP.md).

---

## 🚀 Deployment (Vercel)

### Option A: Vercel Dashboard (recommended)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project → Import Git Repository**
3. Vercel auto-detects Next.js — no config needed
4. Add all environment variables in **Settings → Environment Variables**
5. Deploy ✓

### Option B: Vercel CLI

```bash
npm install -g vercel
vercel login
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add DATABASE_URL
vercel env add DIRECT_URL
vercel env add RESEND_API_KEY
vercel env add FROM_EMAIL
vercel env add FROM_NAME
vercel env add NEXT_PUBLIC_APP_URL
vercel --prod
```

> **Note:** `postinstall` in `package.json` runs `prisma generate` automatically on every Vercel build, so the Prisma client is always up to date.

---

## 🔐 Platform Routes

| Route | Access | Purpose |
|-------|--------|---------|
| `/` | Public | Doctor submits requests — no login |
| `/[labSlug]` | Public | Lab-specific request form — lab pre-selected, no lab picker shown |
| `/login` | Public | Patient OTP login (email) |
| `/dashboard` | Authenticated patients | Patient's test history + results |
| `/doc-login` | Public | Doctor OTP login |
| `/doc-login/dashboard` | Authenticated doctors | Doctor's submitted requests |
| `/lab-login` | Lab users | Supabase Auth login |
| `/lab-dashboard` | Authenticated labs | View & manage requests |
| `/admin-login` | Admin | Admin Auth login |
| `/admin` | Authenticated admin | Manage labs, view all data |

---

## 🏗️ Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Database | Supabase (Postgres via Prisma) | All data storage |
| Auth | Supabase Auth | Lab + Admin sessions only |
| ORM | Prisma | Type-safe DB queries, schema management |
| Email | Resend | Transactional emails |
| Hosting | Vercel | Next.js serverless |

**Key design decisions:**
- Doctors never log in — requests submitted publicly via server API
- All DB mutations through server API routes (Prisma, auth-checked)
- Supabase client used **only** for auth session management
- Lab codes are lab-specific (`PREFIX-XXXXXXX`), wrong-lab check enforced server-side
- Status transitions (`incoming → seen → done`) enforced server-side only

---

## 💻 Local Development

```bash
git clone <repo>
cd poveon
npm install             # also runs prisma generate
cp .env.local.example .env.local
# Fill in .env.local
npm run db:push         # Create DB tables via Prisma
npm run dev             # http://localhost:3000
```

To explore your database visually:
```bash
npm run db:studio       # Opens Prisma Studio at http://localhost:5555
```

---

## 📊 Prisma Schema Overview

```prisma
model Lab      { id, name, prefix (unique), slug (unique), whatsapp, addresses (Json), email,
                 request_email, notification_email, requests[] }
model LabUser  { user_id (Supabase Auth UUID), lab_id → Lab }
model AdminUser{ user_id (Supabase Auth UUID) }
model Request  { code (unique), lab_id → Lab, patient_*, doctor_*, tests, test_image_url,
                 is_critical, needs_ambulance, ambulance_notes, schedule (optional),
                 diagnosis (optional), status, timestamps }
model PatientOtp     { email, code_hash, expires_at, used }
model PatientSession { patient_email, expires_at }
```

Run `npm run db:push` after any schema changes to sync to the database.

---

## 🛣️ Feature Roadmap & Build Plan

### Phase 1 — Emails & Results Flow
- [ ] Add `request_email` field to `Lab` (dedicated new-request notification email, separate from `notification_email`)
- [ ] On request creation, email the lab's `request_email` with full request details. If urgent (ambulance), mark prominently
- [ ] Restructure send-results into **2 mandatory steps**:
  - Step 1: Confirm patient phone (required) + email (required) — updates request record
  - Step 2: Clinical content — PDFs, result link, note, diagnosis (all optional)

### Phase 2 — Patient-Facing Pages
- [ ] Add `whatsapp String?` to `Lab` model (editable in admin + lab dashboard)
- [ ] New page `/request/[code]` — public, shows request details + lab contact info + FAB WhatsApp button
- [ ] Update patient email template to include **"View Request Details"** button → `/request/[code]`

### Phase 3 — Doctor Request Form Enhancements
- [ ] Add `slug String? @unique` to `Lab` model (set in admin dashboard)
- [ ] New dynamic route `/[labSlug]/page.tsx` — pre-selects lab, skips lab selection step
- [ ] Add photo/image upload to doctor form ("Snap or upload test request slip")
  - Store in Supabase Storage (`request-images` bucket)
  - Add `test_image_url String?` to `Request` model
  - Lab dashboard displays the image in request detail view

### Phase 4 — Ambulance & Schedule
- [ ] Add to `Request` model: `is_critical Boolean @default(false)`, `needs_ambulance Boolean @default(false)`, `ambulance_notes String?`
- [ ] In doctor request form: optional checkboxes for "Patient is critical" and "Request ambulance service" (shown only if lab offers ambulance)
- [ ] Ambulance requests trigger urgent email to lab's `request_email`
- [ ] Schedule field made explicitly optional in form UI
- [ ] Patient can update their schedule from `/request/[code]` page (no login needed — code is the auth)

### Phase 5 — Patient Dashboard
- [ ] Add `PatientOtp` and `PatientSession` models (mirrors DoctorOtp/DoctorSession)
- [ ] `/login` — patient enters email → receives 6-digit OTP → session cookie (`patient_token`)
- [ ] `/dashboard` — shows all requests where `patient_email` matches session, with status + results
- [ ] WhatsApp contact button per request linking to the lab's WhatsApp
- [ ] Phone OTP deferred — revisit with Firebase Phone Auth (free, global, Nigeria-compatible) when needed

### Phase 6 — Global Edit Consistency
- [ ] Add `updated_at DateTime @updatedAt` to `Request`
- [ ] Doctor edits via `/doc-login/dashboard` are saved and reflected everywhere (lab dashboard, patient page, patient dashboard)
- [ ] All views show "last updated" timestamp

---

## 📬 Email Types Reference

| Template | Trigger | Recipients |
|----------|---------|------------|
| `doctorRequestConfirmation` | Request created | Doctor |
| `patientRequestCode` | Request created | Patient (if email provided) |
| `labNewRequest` | Request created | Lab `request_email` (new) |
| `labNewRequestUrgent` | Request created + ambulance | Lab `request_email` (new, marked urgent) |
| `doctorPatientArrived` | Status → seen | Doctor |
| `doctorTestsCompleted` | Status → done | Doctor |
| `labResultsDoctor` | Results sent | Doctor |
| `labResultsPatient` | Results sent | Patient |
| `labAccountCreated` | Lab created in admin | Lab owner |
| `labMemberWelcome` | Member added | Lab staff |
| `marketerOtpEmail` | Marketer login | Marketer |
| `doctorOtpEmail` | Doctor login | Doctor |
| `patientOtpEmail` | Patient login (new) | Patient |

---

## 🔑 Decisions Log

| # | Decision |
|---|---------|
| Lab URLs | **Path-based** (`poveon.com/apexlabs`) — subdomain routing deferred |
| Patient auth | **Email OTP** only — phone OTP (Firebase) deferred |
| Patient request page | On hold — not building `/request/[code]` yet |
| Doctor edits | Via `/doc-login` portal — OTP-authenticated |
| Ambulance | Flag within request form, not a separate flow. Triggers urgent email to lab |
| Lab email fields | Two separate fields: `request_email` (new requests) vs `notification_email` (results/brand) |
