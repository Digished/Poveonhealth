"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import {
  BookmarkPlus, CalendarClock, Check, FlaskConical, Loader2, Pill, Plus, RotateCw,
  Sparkles, Trash2, X,
} from "lucide-react";
import { DateInput } from "@/components/ui/DateInput";
import { MED_SUGGESTED_STATUS, isMedicationLive } from "@/lib/medication-status";
import { ConfirmDialog, Modal } from "@/components/ui/Overlay";
import {
  describePrescription,
  estimateQuantity,
  parsePrescriptionBlock,
  type ParsedPrescription,
} from "@/lib/prescription-parse";

/** What a pharmacy or lab reported back about one scheduled item. */
export type Fulfilment = {
  status: string;
  created_at: string;
  recorded_by: string | null;
  note: string | null;
};

export type Prescription = {
  id: string; medication: string; form: string | null; dosage: string | null; frequency: string | null;
  duration_days: number | null; instructions: string | null; raw_text: string | null;
  start_date: string | null; end_date: string | null; status: string;
  cancel_reason: string | null; stopped_note: string | null;
  fulfilments?: Fulfilment[];
};

export type TestOrder = {
  id: string; tests: string; reason: string | null; due_date: string | null;
  recurrence: string; status: string; completed_at: string | null; result_note: string | null;
  fulfilments?: Fulfilment[];
};

type Template = { id: string; kind: string; name: string; payload: Record<string, unknown>; uses: number };

const RECURRENCE_LABEL: Record<string, string> = {
  once: "One-off",
  monthly: "Every month",
  quarterly: "Every 3 months",
  biannual: "Every 6 months",
  annual: "Every year",
};

/** Why a medication stopped. The next doctor reads this, so "stopped" won't do. */
export const CANCEL_REASONS = [
  { value: "not_effective", label: "Not effective" },
  { value: "side_effects", label: "Side effects" },
  { value: "cost", label: "Too expensive" },
  { value: "not_convenient", label: "Patient couldn't keep to it" },
  { value: "condition_resolved", label: "No longer needed" },
  { value: "switched", label: "Switched to something else" },
  { value: "other", label: "Other" },
] as const;

export const CANCEL_REASON_LABEL: Record<string, string> = Object.fromEntries(
  CANCEL_REASONS.map((r) => [r.value, r.label])
);

/** How a partner's report reads back to the doctor. */
export const FULFILMENT_LABEL: Record<string, string> = {
  collected: "Collected",
  partial: "Partly collected",
  out_of_stock: "Not in stock",
  declined: "Not taken",
  done: "Done",
};

const FULFILMENT_TONE: Record<string, string> = {
  collected: "bg-emerald-50 text-emerald-700",
  done: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  out_of_stock: "bg-red-50 text-red-700",
  declined: "bg-red-50 text-red-700",
};

/**
 * What the pharmacy or lab reported. Its absence is information too: nobody has
 * recorded anything, so as far as we know it has not happened.
 */
function FulfilmentNote({ fulfilments, verb }: { fulfilments?: Fulfilment[]; verb: string }) {
  const f = fulfilments?.[0];
  if (!f) {
    return (
      <p className="mt-1 text-[11px] text-slate-400">
        No partner has recorded {verb} yet.
      </p>
    );
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
      <span className={`rounded-full px-2 py-0.5 font-semibold ${FULFILMENT_TONE[f.status] ?? "bg-slate-100 text-slate-600"}`}>
        {FULFILMENT_LABEL[f.status] ?? f.status}
      </span>
      {f.recorded_by ? `at ${f.recorded_by}` : null}
      {formatDate(f.created_at)}
      {f.note ? `· ${f.note}` : null}
    </p>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Days until a due date; negative means overdue. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40";

/**
 * The doctor's working view of what a member is on and what they're due for.
 *
 * Nothing here emails the member: a doctor sets up a whole schedule in one
 * sitting, then sends one update from the member's record when they are done.
 *
 * Read-only when the doctor isn't approved for the care plan — the API refuses
 * anyway, and showing the form would be a lie.
 */
export function CarePlanOrders({
  patientId, prescriptions, testOrders, canPrescribe, onChanged,
}: {
  patientId: string;
  prescriptions: Prescription[];
  testOrders: TestOrder[];
  canPrescribe: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState<"test" | "prescription" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<{ kind: "prescription" | "test"; id: string; name: string } | null>(null);

  // Drafted from the member's own baseline at sign-up, waiting on the doctor.
  // Outside both lists: not live, and not history either.
  const suggestedMeds = prescriptions.filter((p) => p.status === MED_SUGGESTED_STATUS);
  const activeMeds = prescriptions.filter((p) => isMedicationLive(p.status));
  const pastMeds = prescriptions.filter(
    (p) => !isMedicationLive(p.status) && p.status !== MED_SUGGESTED_STATUS
  );
  const dueTests = testOrders.filter((t) => t.status === "scheduled");
  const doneTests = testOrders.filter((t) => t.status !== "scheduled");

  async function update(
    kind: "prescription" | "test",
    id: string,
    status: string,
    extra?: { reason?: string; note?: string }
  ) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/doc-login/consults/patients/${patientId}/orders`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          id,
          status,
          reason: extra?.reason || null,
          note: extra?.note || null,
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not update that."); return; }
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  /** Throw away a suggestion the doctor does not want. Nothing has seen it. */
  async function remove(kind: "prescription" | "test", id: string) {
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/doc-login/consults/patients/${patientId}/orders?kind=${kind}&id=${id}`,
        { method: "DELETE" }
      );
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not remove that."); return; }
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Monitoring schedule ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <FlaskConical className="h-4 w-4 text-medical-500" />
            Tests due
            {dueTests.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                {dueTests.length}
              </span>
            )}
          </h3>
          {canPrescribe && (
            <button
              onClick={() => setAdding(adding === "test" ? null : "test")}
              className="inline-flex items-center gap-1 rounded-lg bg-medical-50 px-2.5 py-1.5 text-xs font-bold text-medical-700 transition hover:bg-medical-100"
            >
              <Plus className="h-3.5 w-3.5" /> Schedule
            </button>
          )}
        </div>

        {adding === "test" && (
          <TestForm patientId={patientId} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); onChanged(); }} />
        )}

        <div className="mt-3 space-y-2">
          {dueTests.length === 0 && !adding && (
            <p className="py-3 text-center text-xs text-slate-400">Nothing scheduled.</p>
          )}
          {dueTests.map((t) => {
            const days = daysUntil(t.due_date);
            const overdue = days != null && days < 0;
            return (
              <div
                key={t.id}
                className={`rounded-xl border px-3.5 py-3 ${
                  overdue ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{t.tests}</p>
                    {t.reason && <p className="mt-0.5 text-xs text-slate-500">{t.reason}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                      <span className={overdue ? "font-bold text-red-600" : "text-slate-500"}>
                        <CalendarClock className="mr-1 inline h-3 w-3" />
                        {t.due_date
                          ? overdue
                            ? `${Math.abs(days!)} day${Math.abs(days!) === 1 ? "" : "s"} overdue`
                            : days === 0
                              ? "Due today"
                              : `Due ${formatDate(t.due_date)}`
                          : "No date set"}
                      </span>
                      {t.recurrence !== "once" && (
                        <span className="inline-flex items-center gap-0.5 text-slate-400">
                          <RotateCw className="h-3 w-3" />
                          {RECURRENCE_LABEL[t.recurrence] ?? t.recurrence}
                        </span>
                      )}
                    </p>
                    <FulfilmentNote fulfilments={t.fulfilments} verb="this test" />
                  </div>
                  {canPrescribe && (
                    <div className="flex shrink-0 gap-1">
                      <IconBtn
                        title="Mark done"
                        busy={busyId === t.id}
                        onClick={() => update("test", t.id, "done")}
                        icon={<Check className="h-3.5 w-3.5" />}
                        tone="emerald"
                      />
                      <IconBtn
                        title="Cancel"
                        busy={busyId === t.id}
                        onClick={() => setCancelling({ kind: "test", id: t.id, name: t.tests })}
                        icon={<X className="h-3.5 w-3.5" />}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {doneTests.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-600">
              {doneTests.length} past test{doneTests.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-2 space-y-1.5">
              {doneTests.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1 text-slate-600">{t.tests}</span>
                  <span className="shrink-0 text-slate-400">
                    {t.status === "done" ? formatDate(t.completed_at) : "Cancelled"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ── Medication ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <Pill className="h-4 w-4 text-emerald-500" />
            Medication
            {activeMeds.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                {activeMeds.length}
              </span>
            )}
          </h3>
          {canPrescribe && (
            <button
              onClick={() => setAdding(adding === "prescription" ? null : "prescription")}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
            >
              <Plus className="h-3.5 w-3.5" /> Schedule
            </button>
          )}
        </div>

        {adding === "prescription" && (
          <PrescriptionForm
            patientId={patientId}
            onClose={() => setAdding(null)}
            onSaved={() => { setAdding(null); onChanged(); }}
          />
        )}

        {suggestedMeds.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
              <Sparkles className="h-3.5 w-3.5" />
              What they told us they take
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
              Read from this member&apos;s own answer at sign-up. Nothing here is live — the member
              cannot see it and no pharmacy can dispense it until you schedule it.
            </p>
            <div className="mt-2.5 space-y-2">
              {suggestedMeds.map((m) => (
                <div key={m.id} className="rounded-lg border border-amber-200 bg-white px-3 py-2.5">
                  <p className="text-sm font-semibold text-slate-800">
                    {m.form ? `${m.form.charAt(0).toUpperCase()}${m.form.slice(1)} · ` : ""}
                    {m.medication}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[m.dosage, m.frequency].filter(Boolean).join(" · ") || "No dose given"}
                  </p>
                  {m.raw_text && (
                    <p className="mt-1 font-mono text-[10px] text-slate-400">
                      &ldquo;{m.raw_text}&rdquo;
                    </p>
                  )}
                  {canPrescribe && (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => update("prescription", m.id, "scheduled")}
                        disabled={busyId === m.id}
                        className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busyId === m.id ? "Working…" : "Schedule it"}
                      </button>
                      <button
                        onClick={() => remove("prescription", m.id)}
                        disabled={busyId === m.id}
                        className="rounded-lg border border-amber-300 px-3 py-1.5 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
                      >
                        Discard
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {activeMeds.length === 0 && !adding && suggestedMeds.length === 0 && (
            <p className="py-3 text-center text-xs text-slate-400">Nothing scheduled.</p>
          )}
          {activeMeds.map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-200 px-3.5 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    {m.form ? `${m.form.charAt(0).toUpperCase()}${m.form.slice(1)} · ` : ""}
                    {m.medication}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[m.dosage, m.frequency].filter(Boolean).join(" · ") || "No dose recorded"}
                  </p>
                  {m.instructions && <p className="mt-1 text-xs text-slate-500">{m.instructions}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">
                    From {formatDate(m.start_date)}
                    {m.end_date ? ` to ${formatDate(m.end_date)}` : " · ongoing"}
                  </p>
                  {m.raw_text && (
                    <p className="mt-1 font-mono text-[10px] text-slate-300">{m.raw_text}</p>
                  )}
                  <FulfilmentNote fulfilments={m.fulfilments} verb="a collection" />
                </div>
                {canPrescribe && (
                  <div className="flex shrink-0 gap-1">
                    <IconBtn
                      title="Mark the course completed"
                      busy={busyId === m.id}
                      onClick={() => update("prescription", m.id, "completed")}
                      icon={<Check className="h-3.5 w-3.5" />}
                      tone="emerald"
                    />
                    <IconBtn
                      title="Stop this medication"
                      busy={busyId === m.id}
                      onClick={() => setCancelling({ kind: "prescription", id: m.id, name: m.medication })}
                      icon={<X className="h-3.5 w-3.5" />}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {pastMeds.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-600">
              {pastMeds.length} past medication{pastMeds.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-2 space-y-1.5">
              {pastMeds.map((m) => (
                <li key={m.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 text-slate-600">{m.medication}</span>
                    <span className="shrink-0 capitalize text-slate-400">{m.status}</span>
                  </div>
                  {m.cancel_reason && (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {CANCEL_REASON_LABEL[m.cancel_reason] ?? m.cancel_reason}
                      {m.stopped_note ? ` — ${m.stopped_note}` : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {cancelling && (
        <CancelDialog
          target={cancelling}
          onClose={() => setCancelling(null)}
          onConfirm={async (reason, note) => {
            await update(cancelling.kind, cancelling.id, "cancelled", { reason, note });
            setCancelling(null);
          }}
        />
      )}

      {!canPrescribe && (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Your care-plan credentials aren&apos;t approved yet, so this is read-only. File them under
          More → Credentials.
        </p>
      )}
    </div>
  );
}

function IconBtn({
  title, icon, onClick, busy, tone,
}: {
  title: string; icon: React.ReactNode; onClick: () => void; busy?: boolean; tone?: "emerald";
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg p-1.5 transition disabled:opacity-40 ${
        tone === "emerald"
          ? "text-emerald-600 hover:bg-emerald-50"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      }`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
    </button>
  );
}

/** Stopping something is a clinical decision; it deserves a reason, not a shrug. */
function CancelDialog({
  target, onClose, onConfirm,
}: {
  target: { kind: "prescription" | "test"; name: string };
  onClose: () => void;
  onConfirm: (reason: string, note: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const needsReason = target.kind === "prescription";

  return (
    <Modal
      open
      onClose={onClose}
      title={`Stop ${target.kind === "prescription" ? "this medication" : "this test"}?`}
      subtitle={target.name}
      footer={
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (needsReason && !reason) return;
              setSaving(true);
              try { await onConfirm(reason, note); } finally { setSaving(false); }
            }}
            disabled={saving || (needsReason && !reason)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Stop it
          </button>
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
            Keep it
          </button>
        </div>
      }
    >
      <>
        {needsReason && (
          <div className="space-y-1.5">
            {CANCEL_REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                  reason === r.value
                    ? "border-medical-500 bg-medical-50 text-medical-800"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 ${
                    reason === r.value ? "border-medical-600" : "border-slate-300"
                  }`}
                >
                  {reason === r.value && <span className="h-1.5 w-1.5 rounded-full bg-medical-600" />}
                </span>
                {r.label}
              </button>
            ))}
          </div>
        )}

        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything to add? (optional)"
          className={`${inputClass} mt-3 resize-none`}
        />
      </>
    </Modal>
  );
}

// ── Templates ───────────────────────────────────────────────────────────────

/** The doctor's saved starting points, offered above whichever form is open. */
function useTemplates(kind: string) {
  const [templates, setTemplates] = useState<Template[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/doc-login/consults/templates?kind=${kind}`, { cache: "no-store" });
      const d = await res.json();
      if (d.success) setTemplates(d.templates);
    } catch {
      /* templates are a convenience, not a requirement */
    }
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(
    async (name: string, payload: unknown) => {
      const res = await fetch("/api/doc-login/consults/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name, payload }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not save that template."); return; }
      toast.success(`Saved "${name}"`);
      void load();
    },
    [kind, load]
  );

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/api/doc-login/consults/templates?id=${id}`, { method: "DELETE" });
      void load();
    },
    [load]
  );

  const markUsed = useCallback(async (id: string) => {
    await fetch("/api/doc-login/consults/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  return { templates, save, remove, markUsed };
}

function TemplateStrip({
  templates, onUse, onRemove,
}: {
  templates: Template[];
  onUse: (t: Template) => void;
  onRemove: (id: string) => void;
}) {
  // A template can be weeks of refinement; a stray tap should not end it.
  const [confirming, setConfirming] = useState<Template | null>(null);

  if (templates.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {templates.map((t) => (
        <span
          key={t.id}
          className="group inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-[11px] font-semibold text-slate-600"
        >
          <button onClick={() => onUse(t)} className="inline-flex items-center gap-1 transition hover:text-medical-700">
            <Sparkles className="h-3 w-3 text-medical-400" />
            {t.name}
          </button>
          <button
            onClick={() => setConfirming(t)}
            aria-label={`Delete ${t.name}`}
            className="rounded-full p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      ))}

      <ConfirmDialog
        open={!!confirming}
        title={`Delete "${confirming?.name ?? ""}"?`}
        body="This only removes the template. Anything you already scheduled from it stays exactly as it is."
        confirmLabel="Delete template"
        onConfirm={() => { if (confirming) onRemove(confirming.id); }}
        onClose={() => setConfirming(null)}
      />
    </div>
  );
}

function SaveTemplateButton({ disabled, onSave }: { disabled: boolean; onSave: (name: string) => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (!naming) {
    return (
      <button
        onClick={() => setNaming(true)}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:text-medical-700 disabled:opacity-40"
      >
        <BookmarkPlus className="h-3.5 w-3.5" /> Save as template
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim().length >= 2) { onSave(name.trim()); setNaming(false); setName(""); }
          if (e.key === "Escape") setNaming(false);
        }}
        placeholder="Template name"
        className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-medical-400"
      />
      <button
        onClick={() => { if (name.trim().length >= 2) { onSave(name.trim()); setNaming(false); setName(""); } }}
        className="rounded-lg bg-medical-600 px-2 py-1 text-[11px] font-bold text-white"
      >
        Save
      </button>
    </div>
  );
}

// ── Forms ───────────────────────────────────────────────────────────────────

function TestForm({
  patientId, onClose, onSaved,
}: {
  patientId: string; onClose: () => void; onSaved: () => void;
}) {
  const [tests, setTests] = useState("");
  const [reason, setReason] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState("once");
  const [saving, setSaving] = useState(false);
  const { templates, save: saveTemplate, remove, markUsed } = useTemplates("test_panel");

  async function save() {
    if (saving || tests.trim().length < 2) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/doc-login/consults/patients/${patientId}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "test",
          tests: tests.trim(),
          reason: reason || null,
          due_date: dueDate || null,
          recurrence,
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not schedule that."); return; }
      toast.success("Test scheduled");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-xl border border-medical-200 bg-medical-50/50 p-3.5">
      <TemplateStrip
        templates={templates}
        onRemove={remove}
        onUse={(t) => {
          const p = t.payload as { tests?: string; reason?: string | null; recurrence?: string };
          setTests(p.tests ?? "");
          setReason(p.reason ?? "");
          setRecurrence(p.recurrence ?? "once");
          void markUsed(t.id);
        }}
      />
      <input
        autoFocus
        value={tests}
        onChange={(e) => setTests(e.target.value)}
        placeholder="Tests, comma separated — e.g. HbA1c, Fasting glucose"
        className={inputClass}
      />
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why? (optional — the member sees this)"
        className={inputClass}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-500">Due date</label>
          <DateInput value={dueDate} onChange={setDueDate} futureOnly placeholder="DD / MM / YYYY" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-500">Repeat</label>
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={inputClass}>
            {Object.entries(RECURRENCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        A repeating test schedules the next one automatically when you mark it done. The member is
        told when you send the update from their record.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={saving || tests.trim().length < 2}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-medical-600 py-2.5 text-xs font-bold text-white transition hover:bg-medical-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Schedule
        </button>
        <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
          Cancel
        </button>
        <SaveTemplateButton
          disabled={tests.trim().length < 2}
          onSave={(name) => saveTemplate(name, { tests: tests.trim(), reason: reason || null, recurrence })}
        />
      </div>
    </div>
  );
}

/**
 * Medication, written the way a doctor writes it.
 *
 * "tabs amlodipine 10mg daily x 1/12" — the parse is shown back before it is
 * saved, so nothing is stored on a guess the doctor hasn't seen. The server
 * parses the same text again rather than trusting what the browser read.
 */
function PrescriptionForm({
  patientId, onClose, onSaved,
}: {
  patientId: string; onClose: () => void; onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);
  const { templates, save: saveTemplate, remove, markUsed } = useTemplates("medication");

  const parsed: ParsedPrescription[] = useMemo(() => parsePrescriptionBlock(text), [text]);
  const shaky = parsed.filter((p) => p.confidence < 0.6 || p.unparsed.length > 0);

  async function save() {
    if (saving || parsed.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/doc-login/consults/patients/${patientId}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "prescription", text, start_date: startDate || null }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not save that."); return; }
      toast.success(`${d.count} medication${d.count === 1 ? "" : "s"} scheduled`);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
      <TemplateStrip
        templates={templates}
        onRemove={remove}
        onUse={(t) => {
          const p = t.payload as { text?: string };
          setText((prev) => (prev.trim() ? `${prev.trim()}\n${p.text ?? ""}` : (p.text ?? "")));
          void markUsed(t.id);
        }}
      />

      <textarea
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"tabs amlodipine 10mg daily x 1/12\ntabs metformin 500mg bd x 3/12"}
        className={`${inputClass} resize-none font-mono text-[13px]`}
      />
      <p className="text-[11px] text-slate-500">
        One per line. <strong>1/7</strong> is days, <strong>1/52</strong> weeks,{" "}
        <strong>1/12</strong> months — so <code>x 3/12</code> is three months. Anything after{" "}
        <code>--</code> becomes an instruction.
      </p>

      {parsed.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-white p-2.5">
          {parsed.map((p, i) => {
            const qty = estimateQuantity(p);
            return (
              <div key={`${p.medication}-${i}`} className="text-xs">
                <p className="font-semibold text-slate-800">{describePrescription(p)}</p>
                <p className="text-[11px] text-slate-400">
                  {qty ? `About ${qty} ${p.form === "syrup" || p.form === "suspension" ? "ml" : "units"} in total` : "Open-ended"}
                  {p.instructions ? ` · ${p.instructions}` : ""}
                  {p.unparsed.length > 0 ? ` · couldn't read: ${p.unparsed.join(" ")}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {shaky.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Check the reading above before you save — some of it didn&apos;t parse cleanly.
        </p>
      )}

      <div>
        <label className="mb-1 block text-[11px] font-semibold text-slate-500">
          Start date <span className="font-normal text-slate-400">(today if left blank)</span>
        </label>
        <DateInput value={startDate} onChange={setStartDate} placeholder="DD / MM / YYYY" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={saving || parsed.length === 0}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Schedule {parsed.length > 1 ? `${parsed.length} medications` : "medication"}
        </button>
        <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
          Cancel
        </button>
        <SaveTemplateButton disabled={text.trim().length < 3} onSave={(name) => saveTemplate(name, { text: text.trim() })} />
      </div>
    </div>
  );
}
