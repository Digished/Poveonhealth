"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import {
  CalendarClock, Check, FlaskConical, Loader2, Pill, Plus, RotateCw, X,
} from "lucide-react";

export type Prescription = {
  id: string; medication: string; dosage: string | null; frequency: string | null;
  duration_days: number | null; instructions: string | null;
  start_date: string | null; end_date: string | null; status: string; stopped_note: string | null;
};

export type TestOrder = {
  id: string; tests: string; reason: string | null; due_date: string | null;
  recurrence: string; status: string; completed_at: string | null; result_note: string | null;
};

const RECURRENCE_LABEL: Record<string, string> = {
  once: "One-off",
  monthly: "Every month",
  quarterly: "Every 3 months",
  biannual: "Every 6 months",
  annual: "Every year",
};

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

/**
 * The doctor's working view of what a member is on and what they're due for.
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

  const activeMeds = prescriptions.filter((p) => p.status === "active");
  const pastMeds = prescriptions.filter((p) => p.status !== "active");
  const dueTests = testOrders.filter((t) => t.status === "scheduled");
  const doneTests = testOrders.filter((t) => t.status !== "scheduled");

  async function update(kind: "prescription" | "test", id: string, status: string, note?: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/doc-login/consults/patients/${patientId}/orders`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, status, note: note ?? null }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Could not update that."); return; }
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
                        onClick={() => update("test", t.id, "cancelled")}
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
              <Plus className="h-3.5 w-3.5" /> Prescribe
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

        <div className="mt-3 space-y-2">
          {activeMeds.length === 0 && !adding && (
            <p className="py-3 text-center text-xs text-slate-400">Nothing prescribed.</p>
          )}
          {activeMeds.map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-200 px-3.5 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{m.medication}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[m.dosage, m.frequency].filter(Boolean).join(" · ") || "No dosage recorded"}
                  </p>
                  {m.instructions && <p className="mt-1 text-xs text-slate-500">{m.instructions}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">
                    From {formatDate(m.start_date)}
                    {m.end_date ? ` to ${formatDate(m.end_date)}` : " · ongoing"}
                  </p>
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
                      onClick={() => {
                        const note = window.prompt("Why are you stopping it? (optional)") ?? "";
                        update("prescription", m.id, "stopped", note);
                      }}
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
                <li key={m.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1 text-slate-600">{m.medication}</span>
                  <span className="shrink-0 capitalize text-slate-400">{m.status}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {!canPrescribe && (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Your care-plan credentials aren&apos;t approved yet, so this is read-only. File them under
          Credentials.
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

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40";

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
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Could not schedule that."); return; }
      toast.success("Test scheduled — the member has been emailed");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-xl border border-medical-200 bg-medical-50/50 p-3.5">
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
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className={inputClass}
        />
        <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={inputClass}>
          {Object.entries(RECURRENCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <p className="text-[11px] text-slate-500">
        A repeating test schedules the next one automatically when you mark it done.
      </p>
      <div className="flex gap-2">
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
      </div>
    </div>
  );
}

function PrescriptionForm({
  patientId, onClose, onSaved,
}: {
  patientId: string; onClose: () => void; onSaved: () => void;
}) {
  const [medication, setMedication] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving || medication.trim().length < 2) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/doc-login/consults/patients/${patientId}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "prescription",
          medication: medication.trim(),
          dosage: dosage || null,
          frequency: frequency || null,
          duration_days: duration ? Number(duration) : null,
          instructions: instructions || null,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Could not save that."); return; }
      toast.success("Prescribed — the member has been emailed");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
      <input
        autoFocus
        value={medication}
        onChange={(e) => setMedication(e.target.value)}
        placeholder="Medication and strength — e.g. Amlodipine 5mg"
        className={inputClass}
      />
      <div className="grid grid-cols-2 gap-2">
        <input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="Dose — 1 tablet" className={inputClass} />
        <input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="Frequency — once daily" className={inputClass} />
      </div>
      <input
        inputMode="numeric"
        value={duration}
        onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))}
        placeholder="Course length in days (leave blank if ongoing)"
        className={inputClass}
      />
      <textarea
        rows={2}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Instructions the member should follow (optional)"
        className={`${inputClass} resize-none`}
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving || medication.trim().length < 2}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Prescribe
        </button>
        <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
          Cancel
        </button>
      </div>
    </div>
  );
}
