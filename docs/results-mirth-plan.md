# Poveon — Result Templates, Receipts & Mirth Integration Plan

Branch: `claude/lab-results-mirth-templates-075i17`

This plan covers the next major LIMS phases: letting labs manage result
templates like a spreadsheet, print/send **receipts**, and optionally integrate
with **Mirth Connect (NextGen Connect)** over HL7 / ASTM.

## What already exists (do not rebuild)

- **Result templates** — `LabResultTemplate` model, `ResultTemplatesManager.tsx`
  in LIMS mode with CRUD, standard-seed, CSV import + sample export
  (`/api/lab/result-templates/*`).
- **Result entry + printing** — `RequestResult` model, entry in `Workspace.tsx`,
  branded PDF via `@react-pdf/renderer` (`src/lib/result-render.ts`), inline print
  (`/api/lab/results/[id]/pdf`) and store+email (`/report`).
- **Payments context for receipts** — `Request.quoted_price`, `test_breakdown`
  (per-test line items), `payment_mode`, `is_paid`.

Genuinely new work: **receipts** and **Mirth/HL7/ASTM**.

## Working assumptions (defaults; override any)

- **Transport:** HTTP both ways. Poveon POSTs to a Mirth HTTP Listener; Mirth
  POSTs inbound to a Poveon webhook. No MLLP in the serverless app (Vercel cannot
  host a persistent TCP listener).
- **Mirth is per-lab:** connection config stored on the `Lab` model.
- **Build order:** Receipts → template coding fields → outbound HL7 ORU →
  inbound ASTM/HL7.

---

## Phase 0 — Result templates: "manage like a CSV" gap

- Inline **spreadsheet-grid editor** in `ResultTemplatesManager.tsx` (edit all
  templates/parameters at once), alongside the existing modal. No schema change.
- Optional **HL7 coding fields** per parameter in the `parameters` JSON:
  `loinc`, `test_code`, `specimen` (nullable, backward-compatible). Extend the
  CSV importer to accept these columns.

Touches: `ResultTemplatesManager.tsx`, `import-csv/route.ts`,
`standard-result-templates.ts`. Schema: none (JSON is additive).

## Phase 1 — Receipts

- New model `RequestReceipt` (`request_receipts`): `id, lab_id, request_id,
  receipt_no, kind ('payment'|'collection'), amount, currency, items JSON,
  payment_mode, issued_by, pdf_url, created_at`.
- `src/lib/receipt-render.ts` — branded PDF, mirrors `result-render.ts`.
- Routes: `POST /api/lab/receipts` (create + render), `GET /api/lab/receipts/[id]/pdf`.
- UI: "Receipt / Print" action on a request (`Workspace.tsx` / `QueueView.tsx`),
  amount from `quoted_price`, line items from `test_breakdown`.
- Payment receipt first; collection/acknowledgement slip = same renderer, other `kind`.

## Phase 2 — Mirth outbound (HL7 ORU^R01 result push)

- Schema: `Lab.mirth_enabled`, `mirth_url`, `mirth_auth_token`; new `HL7Message`
  audit model (`direction, message_type, control_id, payload, status, ack_text,
  attempts`).
- `src/lib/hl7/oru.ts` — build ORU^R01 (MSH/PID/OBR/OBX) from a verified
  `RequestResult`, using template coding + `values[].flag`.
- On result "reported", if `mirth_enabled`, POST HL7 to `mirth_url`; record the
  `HL7Message` and Mirth's ACK. Async with retry.
- UI: lab Mirth settings + an "Interfaces / HL7 log" view with manual resend.

## Phase 3 — Mirth inbound (ASTM / HL7 results from analyzers)

- Webhook `POST /api/mirth/inbound/[labId]` (per-lab shared secret). Mirth
  normalizes ASTM→HL7 in-channel; Poveon receives HL7 OBX.
- `src/lib/hl7/parse.ts` — map OBX onto the matching `RequestResult` by
  accession/order number, auto-fill `values[]` as a **draft** (never auto-report).
- Log all inbound to `HL7Message`; surface unmatched for manual reconciliation.

---

## Sequencing

1. Phase 1 (Receipts) — self-contained, first PR.
2. Phase 0 (grid + coding) — enables Phase 2.
3. Phase 2 (outbound HL7) — testable against a local Mirth HTTP Listener.
4. Phase 3 (inbound ASTM/HL7) — last; needs a real analyzer/Mirth to validate.

Each phase is its own commit/PR; `prisma db push` migrations follow the existing
build flow.

## Open decisions

- (a) Should receipts also set `Request.is_paid` / record payment, or print-only?
- (b) Outbound HL7: EMR-only, or also patient-facing systems?
