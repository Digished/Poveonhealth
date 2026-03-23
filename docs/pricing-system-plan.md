# Lab Test Pricing System — Build Plan

## Overview

A structured, AI-assisted pricing engine that maps free-text doctor test requests
to a canonical test catalog, applies per-lab pricing overrides, snapshots prices
at request time, and deducts from lab wallets automatically.

---

## Test Catalog Structure

### 24 Canonical Categories (no duplicates)

**Clinical**
1. Hematology
2. Coagulation & Haemostasis
3. Clinical Chemistry & Biochemistry
4. Endocrinology & Hormones
5. Immunology & Autoimmune
6. Tumour Markers & Oncology
7. Virology & Serology
8. Microbiology & Culture
9. TB & Mycobacteriology
10. Parasitology
11. Molecular & Genetic Diagnostics
12. Urinalysis
13. Stool & Faecal Tests
14. Body Fluids Analysis
15. Histopathology & Cytology
16. Blood Banking & Transfusion
17. Toxicology & Drug Testing
18. Others / Uncategorized

**Imaging**
19. X-Ray
20. Ultrasound & Echocardiography
21. CT Scan
22. MRI
23. Nuclear Medicine & PET
24. Special Imaging *(mammography, DEXA, fluoroscopy, HSG)*

### Key Design Decisions
- No "Point-of-Care" category — rapid tests use `is_rapid_test: true` flag on the test record
  and live in their correct clinical category (e.g. Rapid Strep A → Microbiology)
- No test exists in more than one category
- "Others / Uncategorized" always exists as a catch-all with a configurable default price
- Immunology & Autoimmune are merged (Autoimmune is a subset)
- Molecular Diagnostics & Cytogenetics are merged (both are genetics-based)
- Virology absorbs viral serology from Immunology (HBsAg, HCV Ab, dengue, EBV, CMV, HSV)

---

## Data Model (Prisma)

### New Models

```prisma
model TestCategory {
  id          String        @id @default(uuid())
  name        String        @unique        // e.g. "Hematology"
  slug        String        @unique        // e.g. "hematology"
  description String?
  sort_order  Int           @default(0)
  created_at  DateTime      @default(now())
  tests       CatalogTest[]
  @@map("test_categories")
}

model CatalogTest {
  id             String         @id @default(uuid())
  category_id    String
  canonical_name String         // e.g. "Full Blood Count"
  base_price     Decimal        @db.Decimal(12, 2)
  is_rapid_test  Boolean        @default(false)
  is_active      Boolean        @default(true)
  created_at     DateTime       @default(now())
  category       TestCategory   @relation(fields: [category_id], references: [id])
  synonyms       TestSynonym[]
  lab_prices     LabTestPrice[]
  @@map("catalog_tests")
}

model TestSynonym {
  id              String      @id @default(uuid())
  catalog_test_id String
  synonym         String      // e.g. "FBC", "CBC", "Full Blood Count"
  catalog_test    CatalogTest @relation(fields: [catalog_test_id], references: [id], onDelete: Cascade)
  @@unique([catalog_test_id, synonym])
  @@index([synonym])
  @@map("test_synonyms")
}

model LabTestPrice {
  id              String      @id @default(uuid())
  lab_id          String
  catalog_test_id String
  price           Decimal     @db.Decimal(12, 2)
  updated_by      String?     // admin email
  updated_at      DateTime    @updatedAt
  lab             Lab         @relation(fields: [lab_id], references: [id], onDelete: Cascade)
  catalog_test    CatalogTest @relation(fields: [catalog_test_id], references: [id], onDelete: Cascade)
  @@unique([lab_id, catalog_test_id])
  @@map("lab_test_prices")
}

model UnmappedTest {
  id               String    @id @default(uuid())
  raw_name         String    @unique
  occurrence_count Int       @default(1)
  last_seen_at     DateTime  @default(now())
  resolved_to      String?   // catalog_test_id once mapped
  status           String    @default("pending") // "pending" | "resolved" | "ignored"
  @@map("unmapped_tests")
}
```

### Additions to Existing Models

```prisma
// Add to Request model
quoted_price   Decimal?  @db.Decimal(12, 2)  // total price snapshot at creation time
test_breakdown Json?     // [{ raw, canonical_id, canonical_name, category, unit_price, confidence }]
```

### Effective Price Logic

```
effectivePrice(lab_id, catalog_test_id) =
  LabTestPrice[lab_id + test_id]?.price     // lab-specific override (negotiated)
  ?? CatalogTest[test_id].base_price         // platform default
  ?? SystemSetting["default_test_price"]     // last-resort fallback
```

---

## Resolution Pipeline

Each individual test string is resolved in order. First match wins.

```
1. Exact synonym match       DB lookup on TestSynonym, case-insensitive    confidence: 1.0
2. Fuzzy match               Trigram / Levenshtein on synonym table         confidence: 0.7–0.99
3. Regex category match      Existing test-categories.ts rules              confidence: 0.5
                             (maps to category — charges category avg price)
4. AI classification         GPT-4o-mini (same key already in use)          confidence: 0.3–0.7
5. Others / Uncategorized    No match found                                 confidence: 0.0
```

- Steps 1–3 are synchronous and free (no API call)
- Step 4 fires only when steps 1–3 fail
- Tests with confidence below 0.4 are also logged to `UnmappedTest` for admin review
- `"See attached image"` requests skip the pipeline and charge `SystemSetting["image_request_price"]`

---

## Build Phases

### Phase 1 — Schema Migration
**Files:** `prisma/schema.prisma`

- Add `TestCategory`, `CatalogTest`, `TestSynonym`, `LabTestPrice`, `UnmappedTest`
- Add `quoted_price` and `test_breakdown` fields to `Request`
- Run `prisma migrate dev`

**Dependency:** Everything else depends on this. Build first.

---

### Phase 2 — AI Catalog Seeding
**Files:** `prisma/seed-tests.ts`

- One-time script using GPT-4o to generate tests and synonyms for all 24 categories
- Inserts `TestCategory` → `CatalogTest` → `TestSynonym` records
- Idempotent — re-running adds missing entries, never duplicates
- Sets `base_price = 0` for all tests initially (admin sets real prices via UI in Phase 5)
- Seeds synonyms in bulk: `FBC`, `CBC`, `Complete Blood Count`, `Haemogram`, `FBP` → `Full Blood Count`

**Run once after Phase 1 migration.**

---

### Phase 3 — Test Resolution Pipeline
**Files:** `src/lib/resolve-tests.ts`, `src/app/api/requests/resolve-tests/route.ts`

Core utility that resolves a raw comma-separated test string into structured results:

```typescript
type ResolvedTest = {
  raw: string
  canonical_id: string | null
  canonical_name: string
  category: string
  unit_price: number
  confidence: number
  is_others: boolean
}

resolveTests(rawTests: string, labId: string): Promise<ResolvedTest[]>
```

- Logs unresolved tests to `UnmappedTest` (upsert — increments occurrence_count)
- Called from request creation and doctor form typeahead
- Builds on the existing `normalize-tests` endpoint (spell-correction runs first)

---

### Phase 4 — Admin Pricing Page
**Files:** `src/app/admin/pricing/page.tsx`, `src/components/AdminPricing.tsx`
**New API routes:** `src/app/api/admin/pricing/`

Three-tab interface:

#### Tab 1 — Test Catalog
- Left panel: category list with `+ Add Category`
- Right panel: tests in selected category
  - Table: `Test Name | Is Rapid | Base Price | Active | Edit`
  - Inline price editing
  - `+ Add Test` with an AI-suggest button (proposes common tests for that category)
  - Synonyms expandable per test row

#### Tab 2 — Lab Price Overrides
- Lab selector dropdown
- Table: `Test Name | Category | Base Price | Lab Override | Effective Price`
- Click any row to set or clear the override
- `Reset to base` per row; `Clear all overrides` bulk action
- Changes logged with admin email in `LabTestPrice.updated_by`

#### Tab 3 — Unmapped Tests Queue
- List sorted by `occurrence_count` descending
- Columns: `Raw Name | Times Seen | Last Seen | Action`
- Per-row actions: `[Map to existing ▾]` | `[Add as new test]` | `[Ignore]`
- Mapping a test creates a `TestSynonym` record permanently
- Count badge on tab when `status = "pending"` records exist

> **Phase 4 must be completed and prices configured before Phase 6 is activated.**
> Deductions should not fire until real prices exist in the catalog.

---

### Phase 5 — Doctor Form: Tag Input with Typeahead
**Files:** `src/components/DoctorRequestForm.tsx`
**New API route:** `src/app/api/catalog/search/route.ts`

Replace the plain textarea for tests with a tag-based input:

- Doctor types → debounced query hits `/api/catalog/search?q=fbc`
- Dropdown shows up to 8 fuzzy matches: `Full Blood Count · Hematology`
- Select from dropdown or press Enter on free-text to add a tag
- Tags render as chips: `[FBC ×] [Urinalysis ×] [___type here___]`
- On submit, tags are joined to comma-separated string — **zero breaking change** to `Request.tests`
- Tags picked from suggestions carry their `canonical_id` for instant resolution at creation
- Free-text tags (not picked from dropdown) go through the full resolution pipeline server-side

**Zero regression risk** — output format is identical to today.

---

### Phase 6 — Wallet Deduction Integration
**Files:** `src/app/api/requests/update-status/route.ts`

**Charge trigger: when request status changes to `"seen"`**

Rationale: charging at creation risks billing labs for spam or mistaken submissions.
Charging on "seen" means the lab consciously acknowledged the request.

Logic:
```
on status → "seen":
  if request.quoted_price > 0:
    deduct from LabWallet
    create WalletTransaction {
      type: "deduction",
      direction: "debit",
      amount: quoted_price,
      request_id: request.id,
      description: "Test request: {code}"
    }
  if wallet.balance < quoted_price:
    allow the deduction (balance goes negative)
    flag transaction as underfunded: true
    admin can see negative-balance labs in AdminDashboard
```

For requests created before this feature (no `quoted_price`):
charge `SystemSetting["default_request_price"]` as a flat fallback.

---

### Phase 7 — Lab Dashboard: Pricing View
**Files:** `src/components/LabDashboard.tsx`

Additions to the existing Wallet tab:

- **Price Schedule section:** paginated table of all tests with the lab's effective price
  - Overridden prices tagged: `₦ 4,500 · custom`
  - Base prices shown plain
- **Transaction drill-down:** each deduction row expands to show the `test_breakdown`:
  `FBC ₦2,000 + LFT ₦1,500 + Urinalysis ₦800 = ₦4,300`

---

## Build Order Summary

```
Phase 1  Schema migration          ← foundation, everything depends on this
Phase 2  AI catalog seeding        ← populates categories and synonyms
Phase 3  Resolution pipeline       ← core logic used by phases 4, 5, 6
Phase 4  Admin pricing page        ← set real prices before charging starts
Phase 5  Doctor form tag input     ← improves future accuracy, not a blocker
Phase 6  Wallet deduction          ← activate only after Phase 4 prices are set
Phase 7  Lab dashboard pricing     ← visibility layer, build last
```

---

## Known Limitations & Mitigations

| Limitation | Impact | Mitigation |
|---|---|---|
| Old requests have no `quoted_price` | Deduction logic has no price to read | Charge `SystemSetting["default_request_price"]` flat rate as fallback |
| AI resolution can misclassify | Test billed to wrong category | Confidence score stored in `test_breakdown`; low-confidence items go to Unmapped Queue for admin review |
| `"See attached image"` requests | Cannot parse tests from an image | Charge a flat `SystemSetting["image_request_price"]`; admin can adjust per request |
| Free-text splitting edge cases | "FBC and LFT" — `and` not a comma | Split on `,` `/` `\n` `;` and ` and ` before resolution |
| Ambiguous test names | "glucose" = fasting, random, or HbA1c? | Resolve to most common form; flag low-confidence for Unmapped Queue |
| Wallet going negative | Lab accumulates debt silently | Allowed but flagged; admin dashboard highlights negative-balance labs |
| Retroactive price changes | Changing a price affects past transactions | `quoted_price` is a snapshot — immune to catalog edits after creation |
| First-seen test pricing gap | New test lands in Others, wrong price | Default Others price acts as placeholder; admin maps it via Unmapped Queue |
| Catalog accuracy over time | Rare/regional tests may be missing | Unmapped Queue + synonym management compounds accuracy; admin adds new tests manually |

---

## Files Created / Modified Summary

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add 5 new models + 2 fields to Request |
| `prisma/seed-tests.ts` | New — one-time AI catalog seeding script |
| `src/lib/resolve-tests.ts` | New — core resolution pipeline utility |
| `src/app/api/requests/resolve-tests/route.ts` | New — HTTP wrapper for resolution pipeline |
| `src/app/api/catalog/search/route.ts` | New — typeahead search endpoint |
| `src/app/api/admin/pricing/` | New — CRUD routes for categories, tests, overrides, unmapped queue |
| `src/app/admin/pricing/page.tsx` | New — admin pricing page route |
| `src/components/AdminPricing.tsx` | New — three-tab pricing management UI |
| `src/components/DoctorRequestForm.tsx` | Modified — replace tests textarea with tag input |
| `src/app/api/requests/update-status/route.ts` | Modified — add wallet deduction on "seen" |
| `src/components/LabDashboard.tsx` | Modified — add price schedule + transaction drill-down to wallet tab |
