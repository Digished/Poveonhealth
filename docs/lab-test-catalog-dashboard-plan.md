# Lab Test Catalog Dashboard — Build Plan

## Overview

An admin-facing (initially) spreadsheet-style dashboard for uploading and managing
per-lab test catalogs. The admin uploads what a specific lab offers and at what price.
The AI pipeline resolves raw test names to canonical entries using synonyms, and the
system calculates the commission Poveon earns per test. This becomes the financial
source of truth for lab payouts and pricing transparency.

> **Prerequisite:** `docs/pricing-system-plan.md` must be completed first.
> The master catalog (`catalog_tests`, `test_synonyms`) must exist before
> per-lab catalogs can be mapped against it.

---

## What This Builds

```
Admin selects a lab
       ↓
Uploads CSV or manually adds rows (test name + lab's price)
       ↓
AI pipeline resolves raw names → canonical catalog entries
       ↓
Commission is calculated per test (configurable %)
       ↓
Lab's offered tests are stored and used for:
  - Showing patients what a lab offers
  - Routing requests only to labs that have the test
  - Calculating wallet deductions accurately
  - Future: lab-facing view of their own catalog
```

---

## Schema Addition

### New Table: `lab_offered_tests`

Represents the specific tests a lab offers, at what price they charge, and Poveon's cut.

```prisma
model LabOfferedTest {
  id               String       @id @default(uuid())
  lab_id           String
  catalog_test_id  String?      // null until AI/admin resolves it
  raw_name         String       // what the lab or CSV says (e.g. "FBC", "full blood count")
  lab_price        Decimal      @db.Decimal(12, 2)  // what the lab charges patients
  poveon_fee       Decimal?     @db.Decimal(12, 2)  // Poveon's cut (calculated or manual)
  commission_pct   Decimal?     @db.Decimal(5, 2)   // e.g. 15.00 for 15%
  is_active        Boolean      @default(true)
  resolution_confidence Decimal? @db.Decimal(4, 3)  // 0.0 – 1.0 from AI pipeline
  resolution_source String?     // "synonym" | "ai" | "manual" | "prefix"
  mapped_by        String?      // admin email if manually mapped
  mapped_at        DateTime?
  created_at       DateTime     @default(now())
  updated_at       DateTime     @updatedAt

  lab          Lab          @relation(fields: [lab_id], references: [id], onDelete: Cascade)
  catalog_test CatalogTest? @relation(fields: [catalog_test_id], references: [id], onDelete: SetNull)

  @@unique([lab_id, raw_name])
  @@index([lab_id])
  @@index([catalog_test_id])
  @@map("lab_offered_tests")
}
```

### Commission Settings (added to `system_settings`)

Stored as key-value entries in the existing `system_settings` table:

| Key | Default | Description |
|-----|---------|-------------|
| `default_commission_pct` | `15` | Global fallback commission % |
| `commission_calculation` | `"percentage"` | `"percentage"` or `"flat"` |

Per-category commission overrides can later be added as a `category_commission_pct`
column on `test_categories` if needed.

### Commission Calculation Formula

```
poveon_fee = lab_price × (commission_pct / 100)

// Example:
// lab_price = ₦5,000
// commission_pct = 15%
// poveon_fee = ₦750
// lab remits ₦750 per test to Poveon
```

---

## CSV Upload Format

The admin uploads a CSV with at minimum two columns:

```csv
test_name,price
Full Blood Count,4500
FBC,4500
Lipid Profile,6000
HbA1c,8000
Abdominal Ultrasound,15000
```

Optional columns the admin can include:

```csv
test_name,price,commission_pct,is_active
Full Blood Count,4500,15,true
```

**Rules:**
- `test_name` is required — mapped via the AI resolution pipeline
- `price` is required — stored as `lab_price`
- `commission_pct` — if omitted, uses `system_settings.default_commission_pct`
- `is_active` — defaults to `true`
- Duplicate `test_name` rows for the same lab: last row wins (upsert)

---

## AI Resolution Flow (Per Row)

Each raw `test_name` from the CSV is passed through the existing resolution pipeline
in `src/lib/resolve-tests.ts`:

```
1. Exact synonym match       → confidence 1.0, source "synonym"
2. Prefix / contains match   → confidence 0.6–0.9, source "prefix"
3. Regex category rules      → confidence 0.5, source "regex"
4. GPT-4o-mini classification → confidence 0.3–0.7, source "ai"
5. Unresolved                → confidence 0.0, source null, flagged for review
```

After resolution:
- `catalog_test_id` is set if confidence ≥ 0.5
- `resolution_confidence` and `resolution_source` are stored
- Rows with confidence < 0.5 are highlighted in the UI for manual mapping
- High-confidence rows are silently accepted

---

## Build Phases

### Phase 1 — Schema Migration
**Files:** `prisma/schema.prisma`
**Branch:** `claude/setup-supabase-staging-keys-TxMG5`

- Add `LabOfferedTest` model (as above)
- Add relation from `CatalogTest` → `LabOfferedTest[]`
- Add relation from `Lab` → `LabOfferedTest[]`
- Run `prisma migrate dev --name add-lab-offered-tests` on staging
- Run `prisma migrate deploy` on production when stable

**No existing tables modified. Purely additive.**

---

### Phase 2 — Backend API Routes
**Files:** `src/app/api/admin/labs/[id]/catalog/`

#### Endpoints

```
GET    /api/admin/labs/[id]/catalog         → list all offered tests for a lab
POST   /api/admin/labs/[id]/catalog         → create a single offered test
PATCH  /api/admin/labs/[id]/catalog/[testId] → update price, commission, mapping
DELETE /api/admin/labs/[id]/catalog/[testId] → remove a test from lab catalog
POST   /api/admin/labs/[id]/catalog/upload  → CSV upload + AI resolution
POST   /api/admin/labs/[id]/catalog/resolve → re-run AI resolution on a single row
GET    /api/admin/labs/[id]/catalog/export  → download current catalog as CSV
```

#### Upload Endpoint Logic (`POST .../catalog/upload`)

```typescript
1. Parse multipart/form-data (CSV file)
2. Parse CSV rows
3. For each row:
   a. Run resolveTests(raw_name, labId) from resolve-tests.ts
   b. Calculate poveon_fee from commission_pct or system default
   c. Upsert into lab_offered_tests (lab_id + raw_name unique)
4. Return summary: { total, resolved, unresolved, updated, created }
```

---

### Phase 3 — Admin UI: Spreadsheet Dashboard
**Files:** `src/components/AdminDashboard.tsx` (new tab), or new component `src/components/LabCatalogSheet.tsx`

#### Location in UI

Add a **"Catalog"** tab inside the existing lab detail modal/panel
(when admin clicks on a specific lab in the Labs tab).

#### Spreadsheet UI Features

**Table columns:**

| Raw Name | Canonical Match | Category | Lab Price | Commission % | Poveon Fee | Status | Actions |
|----------|----------------|----------|-----------|-------------|------------|--------|---------|

**Row status colours:**
- Green = mapped (confidence ≥ 0.8)
- Yellow = low confidence (0.5–0.79) — needs review
- Red = unresolved (< 0.5) — must be manually mapped
- Grey = inactive

**Interactions:**
- Click any cell → inline edit (price, commission %)
- Click canonical match cell → dropdown search of catalog tests (manual override)
- Row checkbox → bulk delete / bulk activate / bulk deactivate
- "Re-resolve" button per row → calls `POST .../catalog/resolve`
- Sort by any column header
- Filter: All | Mapped | Unresolved | Inactive

**Toolbar:**
```
[Upload CSV ↑]  [Add Row +]  [Export CSV ↓]  [Bulk actions ▾]  [Search...]
```

**Upload flow (modal):**
1. Drop CSV or click to browse
2. Preview first 5 rows before confirming
3. Show progress bar during upload
4. Summary toast: "156 tests added · 12 need review · 3 unresolved"
5. Unresolved rows highlighted in red automatically after upload

---

### Phase 4 — Commission Summary Panel
**Files:** `src/components/LabCatalogSheet.tsx` (sidebar or footer)

A summary card below or beside the table showing:

```
Total tests in catalog:     156
Mapped to canonical:        143 (91.7%)
Unresolved:                  13 (8.3%)

Average lab price:          ₦6,240
Average commission:         15%
Estimated Poveon revenue
  (if all tests run once): ₦146,340
```

This gives admin a quick financial overview per lab.

---

### Phase 5 — Routing Integration (Request Matching)
**Files:** `src/lib/resolve-tests.ts`, `src/app/api/requests/`

When a new request comes in for a lab, cross-reference the test against `lab_offered_tests`:

```
Does this lab have the requested test in their catalog?
  → Yes: use lab_offered_tests.lab_price as the price
  → No:  use lab_test_prices or catalog_tests.base_price fallback
         and flag: lab may not offer this test
```

This allows future smart routing: "send to a lab that actually offers this test."

---

### Phase 6 — Lab-Facing View (Future)
**Files:** `src/components/LabDashboard.tsx`

When ready to open this to labs:

- Add "My Tests" tab in lab dashboard
- Shows their catalog (read-only first, then editable with admin approval)
- Lab can request additions — admin approves and maps
- Lab sees their commission rates and effective Poveon fees

**Not built now. Designed for here but deferred.**

---

## Build Order Summary

```
Prerequisite  pricing-system-plan.md phases 1–2   ← master catalog must exist first
Phase 1       Schema migration                     ← add lab_offered_tests table
Phase 2       API routes                           ← backend CRUD + CSV upload
Phase 3       Admin spreadsheet UI                 ← the visible dashboard
Phase 4       Commission summary panel             ← financial overview per lab
Phase 5       Request routing integration          ← cross-reference on new requests
Phase 6       Lab-facing view                      ← deferred, build later
```

---

## File Summary

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `LabOfferedTest` model + relations |
| `src/app/api/admin/labs/[id]/catalog/route.ts` | New — list, create |
| `src/app/api/admin/labs/[id]/catalog/[testId]/route.ts` | New — update, delete |
| `src/app/api/admin/labs/[id]/catalog/upload/route.ts` | New — CSV upload + AI resolve |
| `src/app/api/admin/labs/[id]/catalog/resolve/route.ts` | New — re-resolve single row |
| `src/app/api/admin/labs/[id]/catalog/export/route.ts` | New — CSV export |
| `src/components/LabCatalogSheet.tsx` | New — spreadsheet UI component |
| `src/components/AdminDashboard.tsx` | Modified — add Catalog tab to lab detail view |
| `src/lib/resolve-tests.ts` | Modified — expose resolution for single test name |

---

## Risk & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Lab uses different name than catalog | Test unresolved, no canonical match | AI pipeline + synonym fallback; red rows flagged for admin |
| Same test uploaded twice in CSV | Duplicate data | `@@unique([lab_id, raw_name])` — upsert by default |
| Commission rate changes after upload | Historical rows use wrong rate | `commission_pct` stored per row (snapshot), not a live reference |
| Catalog_test deleted after mapping | Orphaned `lab_offered_tests` row | `onDelete: SetNull` — `catalog_test_id` becomes null, row flagged unresolved |
| Large CSV (1000+ rows) | Slow upload, timeout risk | Process in batches of 50; return progress via streaming or polling |
| Admin uploads wrong CSV | Bad data for a lab | Export-before-upload pattern; or a "clear catalog" confirmation modal |

---

## Key Decisions

- **Upsert by `raw_name`** — re-uploading a CSV updates existing rows rather than duplicating
- **Snapshot commission** — the `commission_pct` on each row is frozen at upload time; changing the global default does not retroactively update rows
- **Confidence threshold at 0.5** — below this, the canonical match is not trusted; row is flagged for manual review
- **Lab price is the source of truth** — Poveon fee is derived from it, not the other way around
- **No lab access in Phase 1–5** — labs cannot see or modify their catalog until Phase 6 is explicitly built
