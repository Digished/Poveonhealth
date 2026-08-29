"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import {
  BookmarkPlus, Check, ClipboardList, GripVertical, Loader2, Plus, Sparkles, Trash2, X,
} from "lucide-react";
import { CADENCES, CADENCE_LABEL, MEASURES, MEASURE_LABEL } from "@/lib/treatment-plan";
import { ConfirmDialog } from "@/components/ui/Overlay";

export type PlanItem = {
  id?: string;
  label: string;
  detail: string | null;
  cadence: string;
  remind: boolean;
  /** What the member is asked to record when they tick it. */
  measure?: string;
  measure_label?: string | null;
  done_count?: number;
  due?: boolean;
  days_until?: number | null;
  last_done_at?: string | null;
};

export type TreatmentPlan = {
  id: string;
  title: string;
  note: string | null;
  notified_at: string | null;
  updated_at: string;
  items: PlanItem[];
};

type Template = { id: string; name: string; payload: Record<string, unknown>; uses: number };

/** Enough of a starting point that a doctor edits rather than types from blank. */
const SUGGESTIONS: { label: string; detail: string; cadence: string; measure: string }[] = [
  { label: "Check your blood pressure", detail: "Sit quietly for five minutes first", cadence: "weekly", measure: "bp" },
  { label: "Check your blood sugar", detail: "Fasting, before breakfast", cadence: "weekly", measure: "glucose" },
  { label: "Take a 30-minute walk", detail: "Any pace you can hold a conversation at", cadence: "daily", measure: "none" },
  { label: "Cut back on salt", detail: "No added salt at the table; go easy on seasoning cubes", cadence: "daily", measure: "none" },
  { label: "Weigh yourself", detail: "Same time of day, same scale", cadence: "weekly", measure: "weight" },
  { label: "Refill your medication", detail: "Before you run out, not after", cadence: "monthly", measure: "none" },
];

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40";

/**
 * The treatment plan: a short checklist the member works from between messages.
 *
 * Each item carries how often, and the member's dashboard works out what is due
 * from when they last ticked it — so a missed week is one outstanding item
 * rather than seven.
 */
export function CarePlanTreatment({
  patientId, plan, canEdit, onChanged,
}: {
  patientId: string;
  plan: TreatmentPlan | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <PlanEditor
        patientId={patientId}
        plan={plan}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); onChanged(); }}
      />
    );
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <ClipboardList className="h-4 w-4 text-medical-500" />
          {plan?.title ?? "Treatment plan"}
          {plan && plan.items.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
              {plan.items.length}
            </span>
          )}
        </h3>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-medical-50 px-2.5 py-1.5 text-xs font-bold text-medical-700 transition hover:bg-medical-100"
          >
            {plan ? "Edit" : <><Plus className="h-3.5 w-3.5" /> Write one</>}
          </button>
        )}
      </div>

      {!plan || plan.items.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">
          Nothing yet. A plan is what the member does between messages — check BP weekly, cut back on
          salt, walk most days.
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {plan.items.map((item) => (
              <li key={item.id} className="rounded-xl border border-slate-200 px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                    {item.detail && <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {CADENCE_LABEL[item.cadence] ?? item.cadence}
                    </span>
                    {item.measure && item.measure !== "none" && (
                      <span className="rounded-full bg-medical-50 px-2 py-0.5 text-[10px] font-bold text-medical-700">
                        {item.measure === "number" && item.measure_label
                          ? item.measure_label
                          : MEASURE_LABEL[item.measure] ?? item.measure}
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {item.done_count ? `Ticked ${item.done_count} time${item.done_count === 1 ? "" : "s"}` : "Not started"}
                  {item.due ? " · due now" : item.days_until != null ? ` · next in ${item.days_until} day${item.days_until === 1 ? "" : "s"}` : ""}
                </p>
              </li>
            ))}
          </ul>
          {plan.note && (
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{plan.note}</p>
          )}
        </>
      )}
    </section>
  );
}

function PlanEditor({
  patientId, plan, onClose, onSaved,
}: {
  patientId: string;
  plan: TreatmentPlan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(plan?.title ?? "Treatment plan");
  const [note, setNote] = useState(plan?.note ?? "");
  const [items, setItems] = useState<PlanItem[]>(
    plan?.items.map((i) => ({
      id: i.id, label: i.label, detail: i.detail, cadence: i.cadence, remind: i.remind,
      measure: i.measure ?? "none", measure_label: i.measure_label ?? null,
    })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  // A saved plan is worth a second look before it goes.
  const [confirmingDelete, setConfirmingDelete] = useState<Template | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/doc-login/consults/templates?kind=treatment_plan", { cache: "no-store" });
      const d = await res.json();
      if (d.success) setTemplates(d.templates);
    } catch {
      /* templates are a convenience */
    }
  }, []);
  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  const addItem = (item: Partial<PlanItem>) =>
    setItems((prev) => [
      ...prev,
      {
        label: item.label ?? "",
        detail: item.detail ?? null,
        cadence: item.cadence ?? "weekly",
        remind: true,
        measure: item.measure ?? "none",
        measure_label: item.measure_label ?? null,
      },
    ]);

  const patch = (index: number, changes: Partial<PlanItem>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...changes } : it)));

  const move = (index: number, delta: number) =>
    setItems((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const ready = items.filter((i) => i.label.trim().length >= 2);

  async function save() {
    if (saving || ready.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/doc-login/consults/patients/${patientId}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Treatment plan",
          note: note.trim() || null,
          items: ready.map((i) => ({
            id: i.id ?? null,
            label: i.label.trim(),
            detail: i.detail?.trim() || null,
            cadence: i.cadence,
            remind: i.remind,
            measure: i.measure ?? "none",
            measure_label: i.measure_label?.trim() || null,
          })),
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not save the plan."); return; }
      toast.success("Plan saved");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate(name: string) {
    const res = await fetch("/api/doc-login/consults/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "treatment_plan",
        name,
        payload: {
          title: title.trim() || "Treatment plan",
          note: note.trim() || null,
          items: ready.map((i) => ({
            label: i.label.trim(),
            detail: i.detail?.trim() || null,
            cadence: i.cadence,
            remind: i.remind,
            measure: i.measure ?? "none",
            measure_label: i.measure_label?.trim() || null,
          })),
        },
      }),
    });
    const d = await res.json().catch(() => null);
    if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not save that template."); return; }
    toast.success(`Saved "${name}"`);
    void loadTemplates();
  }

  return (
    <section className="rounded-2xl border border-medical-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <ClipboardList className="h-4 w-4 text-medical-500" /> Treatment plan
        </h3>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {templates.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {templates.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-[11px] font-semibold text-slate-600">
              <button
                onClick={() => {
                  const p = t.payload as { title?: string; note?: string | null; items?: PlanItem[] };
                  if (p.title) setTitle(p.title);
                  if (p.note) setNote(p.note);
                  setItems((prev) => [
                    ...prev,
                    ...(p.items ?? []).map((i) => ({
                      label: i.label, detail: i.detail ?? null, cadence: i.cadence ?? "weekly", remind: true,
                    })),
                  ]);
                  void fetch("/api/doc-login/consults/templates", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: t.id }),
                  }).catch(() => {});
                }}
                className="inline-flex items-center gap-1 transition hover:text-medical-700"
              >
                <Sparkles className="h-3 w-3 text-medical-400" /> {t.name}
              </button>
              <button
                onClick={() => setConfirmingDelete(t)}
                aria-label={`Delete ${t.name}`}
                className="rounded-full p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-red-500"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Plan title"
        className={`${inputClass} mt-3 font-semibold`}
      />

      <ul className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={item.id ?? `new-${index}`} className="rounded-xl border border-slate-200 p-2.5">
            <div className="flex items-start gap-1.5">
              <div className="flex flex-col pt-1">
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="text-slate-300 transition hover:text-slate-500 disabled:opacity-30"
                  aria-label="Move up"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <input
                  value={item.label}
                  onChange={(e) => patch(index, { label: e.target.value })}
                  placeholder="What to do — e.g. Check your blood pressure"
                  className={inputClass}
                />
                <input
                  value={item.detail ?? ""}
                  onChange={(e) => patch(index, { detail: e.target.value })}
                  placeholder="How, in one line (optional)"
                  className={`${inputClass} text-xs`}
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {CADENCES.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => patch(index, { cadence: c.value })}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                        item.cadence === c.value
                          ? "bg-medical-600 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                  <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <input
                      type="checkbox"
                      checked={item.remind}
                      onChange={(e) => patch(index, { remind: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-medical-600"
                    />
                    Remind
                  </label>
                </div>

                {/* What to ask for when they tick it — the reading is what you
                    actually read back, not the count of ticks. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-400">Ask for</span>
                  {MEASURES.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => patch(index, { measure: m.value })}
                      title={m.hint}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                        (item.measure ?? "none") === m.value
                          ? "bg-slate-800 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {item.measure === "number" && (
                  <input
                    value={item.measure_label ?? ""}
                    onChange={(e) => patch(index, { measure_label: e.target.value })}
                    placeholder="What is the number? e.g. minutes walked"
                    className={`${inputClass} text-xs`}
                  />
                )}
              </div>
              <button
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                className="rounded-lg p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                aria-label="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        onClick={() => addItem({})}
        className="mt-2 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
      >
        <Plus className="h-3.5 w-3.5" /> Add something
      </button>

      <div className="mt-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Common ones</p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.filter((sug) => !items.some((i) => i.label === sug.label)).map((sug) => (
            <button
              key={sug.label}
              onClick={() => addItem(sug)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-medical-300 hover:text-medical-700"
            >
              <Plus className="h-3 w-3" /> {sug.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything that doesn't belong on a single line (optional)"
        className={`${inputClass} mt-3 resize-none`}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={saving || ready.length === 0}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-medical-600 py-2.5 text-xs font-bold text-white transition hover:bg-medical-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save plan
        </button>
        <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
          Cancel
        </button>
        <TemplateSaver disabled={ready.length === 0} onSave={saveTemplate} />
      </div>

      <ConfirmDialog
        open={!!confirmingDelete}
        title={`Delete "${confirmingDelete?.name ?? ""}"?`}
        body="This only removes the template. Plans you already wrote from it are untouched."
        confirmLabel="Delete template"
        onConfirm={async () => {
          if (!confirmingDelete) return;
          await fetch(`/api/doc-login/consults/templates?id=${confirmingDelete.id}`, { method: "DELETE" });
          void loadTemplates();
        }}
        onClose={() => setConfirmingDelete(null)}
      />
    </section>
  );
}

function TemplateSaver({ disabled, onSave }: { disabled: boolean; onSave: (name: string) => void }) {
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
