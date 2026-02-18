# Poveon Health — Laboratory Request Platform

A production-ready web platform that allows doctors to send laboratory test requests to labs **without requiring doctor login**.

---

## 📁 Folder Structure

```
poveon/
├── .env.local.example          # Environment variable template
├── netlify.toml                # Netlify deployment config
├── next.config.js              # Next.js config
├── tailwind.config.ts          # Tailwind CSS config
├── tsconfig.json
├── supabase/
│   └── schema.sql              # Full DB schema + RLS policies
└── src/
    ├── app/
    │   ├── layout.tsx           # Root layout with toast provider
    │   ├── page.tsx             # Home page — Doctor request form
    │   ├── globals.css          # Global styles
    │   ├── lab-login/page.tsx   # Lab authentication
    │   ├── lab-dashboard/page.tsx
    │   ├── admin-login/page.tsx
    │   ├── admin/page.tsx
    │   └── api/
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
    │   ├── supabase/
    │   │   ├── client.ts        # Browser Supabase client
    │   │   └── server.ts        # Server + Admin Supabase clients
    │   ├── types.ts             # Shared TypeScript types
    │   ├── code-generator.ts    # Unique lab code generation
    │   └── email/
    │       ├── resend.ts        # Resend client init
    │       └── templates.ts     # HTML email templates
    └── middleware.ts            # Route protection (lab/admin auth)
```

---

## 🗄️ Database Setup (Supabase)

### Step 1: Run the schema

1. Go to your Supabase project → **SQL Editor**
2. Paste the entire contents of `supabase/schema.sql`
3. Click **Run**

### Step 2: Create your first Admin user

1. Go to **Authentication → Users → Add User**
2. Enter an email and password, click **Create User**
3. Copy the user's UUID
4. In the SQL Editor, run:

```sql
INSERT INTO public.admin_users (user_id) VALUES ('YOUR-UUID-HERE');

-- Also set the role in user metadata:
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE id = 'YOUR-UUID-HERE';
```

### Step 3: Configure Auth settings

In Supabase → **Authentication → Settings**:
- Disable email confirmation for lab users (Admin will create them programmatically with confirmed emails)
- OR leave it enabled — the API uses `email_confirm: true` when creating lab users

---

## ⚙️ Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Never expose this client-side

# Resend
RESEND_API_KEY=re_...

# Email sender
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=Poveon Health

# App URL (for email links)
NEXT_PUBLIC_APP_URL=https://your-app.netlify.app
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` must NEVER be exposed to the browser. It's only used in server-side API routes.

---

## 🚀 Deployment (Netlify)

### Option A: Deploy via Netlify CLI

```bash
npm install -g netlify-cli
npm install
netlify login
netlify init
netlify env:set NEXT_PUBLIC_SUPABASE_URL "..."
netlify env:set NEXT_PUBLIC_SUPABASE_ANON_KEY "..."
netlify env:set SUPABASE_SERVICE_ROLE_KEY "..."
netlify env:set RESEND_API_KEY "..."
netlify env:set FROM_EMAIL "noreply@yourdomain.com"
netlify env:set FROM_NAME "Poveon Health"
netlify env:set NEXT_PUBLIC_APP_URL "https://your-app.netlify.app"
netlify deploy --prod
```

### Option B: Deploy via Netlify UI

1. Push this repo to GitHub
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import from Git**
3. Select your repo
4. Build settings:
   - Build command: `npm run build`
   - Publish directory: `.next`
5. Add all environment variables in **Site settings → Environment variables**
6. Deploy

> The `netlify.toml` already configures `@netlify/plugin-nextjs` automatically.

### Required Netlify Plugin

Add to `package.json` devDependencies if not auto-installed:

```bash
npm install -D @netlify/plugin-nextjs
```

---

## 🔐 Platform Routes

| Route | Access | Purpose |
|-------|--------|---------|
| `/` | Public (doctors) | Submit lab requests — no login |
| `/lab-login` | Lab users | Supabase auth login |
| `/lab-dashboard` | Authenticated labs | View & manage requests |
| `/admin-login` | Admin | Admin auth login |
| `/admin` | Authenticated admin | Manage labs, view all requests |

---

## 🔑 Code Generation

Each request code is:
- **Unique** — checked against DB before saving
- **Lab-specific** — prefixed with the lab's short code
- **Format**: `LABPREFIX-XXXXXXX` (e.g., `LGHL-8X4K29Q`)

The prefix is derived from the lab name:
- "Lagos General Hospital Lab" → `LGHL`
- "Metro Lab" → `MLAB`

---

## 📧 Email Automation

| Trigger | Recipient(s) | Template |
|---------|-------------|---------|
| Request submitted | Doctor + Patient (optional) | Code, lab details |
| Lab retrieves patient code | Doctor | Patient arrived notification |
| Lab marks tests as Done | Doctor | Tests completed notification |
| New lab account created | Lab | Login credentials |

---

## 🏗️ Core Logic Security

- **No doctor auth** — Requests created via server API with service role key
- **Lab RLS** — Labs can only query `requests` where `lab_id` = their own
- **Wrong lab code** — Returns "This request does not belong to your laboratory"
- **Admin verified** — Admin APIs check `admin_users` table server-side
- **Input validation** — All API routes validate with Zod schemas
- **Status transitions** — Enforced server-side: `incoming → seen → done` only

---

## 💻 Local Development

```bash
git clone <repo-url>
cd poveon
npm install
cp .env.local.example .env.local
# Fill in your .env.local values
npm run dev
# Open http://localhost:3000
```

---

## 📊 DB Schema Overview

```
labs          → id, name, prefix, addresses[], email
lab_users     → user_id (auth), lab_id (→ labs)
admin_users   → user_id (auth)
requests      → code, lab_id, patient_*, doctor_*, tests, status, timestamps
```

RLS enforces:
- `labs`: public read (for doctor dropdown), admin write
- `requests`: lab users see only their lab's requests; admin sees all
- All inserts/mutations via service role API routes

---

## 📦 Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| Email | Resend |
| Hosting | Netlify |
| Validation | Zod |
| Icons | Lucide React |
