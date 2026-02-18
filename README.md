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
    │   └── api/
    │       ├── labs/route.ts              # GET: Lab list for dropdown
    │       ├── lab/requests/route.ts      # GET: Lab's own requests
    │       ├── requests/
    │       │   ├── create/route.ts        # POST: Submit lab request
    │       │   ├── retrieve/route.ts      # POST: Retrieve by code
    │       │   └── update-status/route.ts # POST: Update status
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
```

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
model Lab      { id, name, prefix (unique), addresses (Json), email, requests[] }
model LabUser  { user_id (Supabase Auth UUID), lab_id → Lab }
model AdminUser{ user_id (Supabase Auth UUID) }
model Request  { code (unique), lab_id → Lab, patient_*, doctor_*, tests, status, timestamps }
```

Run `npm run db:push` after any schema changes to sync to the database.
