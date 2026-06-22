"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import {
  ArrowLeft, Plus, Trash2, Heading1, Text, Stethoscope, ClipboardList,
  Pill, FlaskConical, CheckSquare, Minus, ShieldAlert, PenLine, Loader2, Sparkles,
} from "lucide-react";
import { suggestionsFor } from "@/lib/emr/clinical-suggestions";
import type { ParsedRxItem } from "@/lib/emr/prescription";

type BlockType =
  | "heading" | "paragraph" | "history" | "examination" | "diagnosis"
  | "plan" | "prescription" | "lab_order" | "checklist" | "divider";

interface Block {
  id: string;
  type: BlockType;
  text?: string;
  data?: { parsed?: ParsedRxItem[]; tests?: string[]; checked?: boolean };
}

interface Loaded {
  note: { id: string; content: Block[]; status: string };
  patient: {
    full_name: string; hospital_number: string; age: number | null; sex: string | null; allergies: string | null;
  };
  latest_vitals: {
    temperature: number | null; systolic: number | null; diastolic: number | null;
    pulse: number | null; spo2: number | null; resp_rate: number | null;
  } | null;
  encounter: { chief_complaint: string | null };
}

const COMMANDS: { type: BlockType; label: string; icon: React.ReactNode; hint: string }[] = [
  { type: "history", label: "History", icon: <ClipboardList className="w-4 h-4" />, hint: "Presenting complaint, PMH…" },
  { type: "examination", label: "Examination", icon: <Stethoscope className="w-4 h-4" />, hint: "Physical exam findings" },
  { type: "diagnosis", label: "Diagnosis", icon: <PenLine className="w-4 h-4" />, hint: "Impression / assessment" },
  { type: "plan", label: "Plan", icon: <CheckSquare className="w-4 h-4" />, hint: "Management plan" },
  { type: "prescription", label: "Prescription", icon: <Pill className="w-4 h-4" />, hint: "Free text → auto table" },
  { type: "lab_order", label: "Lab order", icon: <FlaskConical className="w-4 h-4" />, hint: "Investigations to run" },
  { type: "heading", label: "Heading", icon: <Heading1 className="w-4 h-4" />, hint: "Section title" },
  { type: "paragraph", label: "Note", icon: <Text className="w-4 h-4" />, hint: "Plain text" },
  { type: "checklist", label: "Checklist", icon: <CheckSquare className="w-4 h-4" />, hint: "To-do item" },
  { type: "divider", label: "Divider", icon: <Minus className="w-4 h-4" />, hint: "Separator" },
];

const SECTION_TITLE: Partial<Record<BlockType, string>> = {
  history: "History", examination: "Examination", diagnosis: "Diagnosis", plan: "Plan",
  prescription: "Prescription", lab_order: "Laboratory order",
};

function uid() { return Math.random().toString(36).slice(2, 10); }

function AutoTextarea({ value, onChange, placeholder, className, autoFocus, onSlash }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean;
  onSlash?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = `${ref.current.scrollHeight}px`; }
  }, [value]);
  return (
    <textarea
      ref={ref} value={value} autoFocus={autoFocus} placeholder={placeholder} rows={1}
      onChange={(e) => {
        const v = e.target.value;
        if (onSlash && v === "/") { onSlash(); return; }
        onChange(v);
      }}
      className={`w-full resize-none bg-transparent outline-none ${className ?? ""}`}
    />
  );
}

export function ConsultationEditor({ encounterId, onClose }: { encounterId: string; onClose: () => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [slashFor, setSlashFor] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [signing, setSigning] = useState(false);
  const noteIdRef = useRef<string | null>(null);
  const signed = data?.note.status === "signed";

  useEffect(() => {
    fetch(`/api/emr/consultation?encounter_id=${encounterId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setData(d);
          noteIdRef.current = d.note.id;
          const content: Block[] = Array.isArray(d.note.content) ? d.note.content : [];
          setBlocks(content.length ? content : [{ id: uid(), type: "history", text: "" }]);
        } else toast.error(d.error ?? "Failed to load.");
      })
      .finally(() => setLoading(false));
  }, [encounterId]);

  // Debounced autosave
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = useCallback((next: Block[]) => {
    if (signed || !noteIdRef.current) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch("/api/emr/consultation", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note_id: noteIdRef.current, content: next }),
        });
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } catch { setSaveState("idle"); }
    }, 800);
  }, [signed]);

  function update(next: Block[]) { setBlocks(next); scheduleSave(next); }
  function patchBlock(id: string, patch: Partial<Block>) {
    update(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function addBlock(type: BlockType, afterId?: string) {
    const nb: Block = { id: uid(), type, text: "" };
    if (!afterId) { update([...blocks, nb]); return; }
    const idx = blocks.findIndex((b) => b.id === afterId);
    const copy = [...blocks];
    copy.splice(idx + 1, 0, nb);
    update(copy);
  }
  function setBlockType(id: string, type: BlockType) {
    patchBlock(id, { type, text: "", data: {} });
    setSlashFor(null);
  }
  function removeBlock(id: string) { update(blocks.filter((b) => b.id !== id)); }

  async function parseRx(id: string, text: string) {
    if (!text.trim()) return;
    try {
      const res = await fetch("/api/emr/parse/prescription", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await res.json();
      if (d.success) patchBlock(id, { data: { parsed: d.items } });
    } catch { /* keep raw text */ }
  }

  function parseLabs(id: string, text: string) {
    const tests = text.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean);
    patchBlock(id, { text, data: { tests } });
  }

  async function sign() {
    if (!noteIdRef.current) return;
    if (!window.confirm("Sign this note? It becomes read-only and prescriptions/labs are sent to their departments.")) return;
    setSigning(true);
    try {
      const res = await fetch("/api/emr/consultation/sign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_id: noteIdRef.current, content: blocks }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed to sign."); return; }
      const bits = [];
      if (d.prescriptions) bits.push(`${d.prescriptions} script(s) → pharmacy`);
      if (d.lab_orders) bits.push(`${d.lab_orders} order(s) → lab`);
      toast.success(`Note signed${bits.length ? ` · ${bits.join(", ")}` : ""}.`);
      onClose();
    } finally {
      setSigning(false);
    }
  }

  if (loading) return <div className="py-20 text-center text-sm text-slate-400">Loading consultation…</div>;
  if (!data) return null;
  const v = data.latest_vitals;

  return (
    <div className="pb-28">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500"><ArrowLeft className="w-4 h-4" /> Queue</button>
        <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
          {saveState === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>}
          {saveState === "saved" && <>Saved</>}
          {signed && <span className="text-emerald-600 font-semibold">Signed</span>}
        </span>
      </div>

      {/* Paper sheet */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Letterhead */}
        <div className="px-5 sm:px-8 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xl font-bold text-slate-900 leading-tight">{data.patient.full_name}</p>
              <p className="text-xs text-slate-400 font-mono">{data.patient.hospital_number} · {data.patient.age ?? "—"} {data.patient.sex ?? ""}</p>
            </div>
            {data.patient.allergies && (
              <span className="text-xs bg-amber-50 text-amber-700 rounded-lg px-2 py-1 flex items-center gap-1 shrink-0">
                <ShieldAlert className="w-3.5 h-3.5" /> {data.patient.allergies}
              </span>
            )}
          </div>
          {v && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
              {v.temperature != null && <span><b className="text-slate-700">{v.temperature}</b>°C</span>}
              {v.systolic != null && <span>BP <b className="text-slate-700">{v.systolic}/{v.diastolic}</b></span>}
              {v.pulse != null && <span>PR <b className="text-slate-700">{v.pulse}</b></span>}
              {v.resp_rate != null && <span>RR <b className="text-slate-700">{v.resp_rate}</b></span>}
              {v.spo2 != null && <span>SpO₂ <b className="text-slate-700">{v.spo2}</b>%</span>}
            </div>
          )}
          {data.encounter.chief_complaint && (
            <p className="mt-2 text-sm text-slate-600 italic">“{data.encounter.chief_complaint}”</p>
          )}
        </div>

        {/* Blocks */}
        <div className="px-5 sm:px-8 py-5 space-y-1">
          {blocks.map((b) => (
            <div key={b.id} className="group relative">
              <BlockView
                block={b} signed={!!signed}
                onText={(t) => patchBlock(b.id, { text: t })}
                onSlash={() => setSlashFor(b.id)}
                onParseRx={() => parseRx(b.id, b.text ?? "")}
                onParseLabs={(t) => parseLabs(b.id, t)}
                onToggleCheck={() => patchBlock(b.id, { data: { ...b.data, checked: !b.data?.checked } })}
                onAddSuggestion={(s) => patchBlock(b.id, { text: `${b.text ? b.text + "\n" : ""}${s}: ` })}
              />
              {!signed && (
                <div className="absolute -left-5 sm:-left-7 top-1 opacity-0 group-hover:opacity-100 transition flex flex-col gap-0.5">
                  <button onClick={() => addBlock("paragraph", b.id)} title="Add below" className="text-slate-300 hover:text-medical-500"><Plus className="w-3.5 h-3.5" /></button>
                  <button onClick={() => removeBlock(b.id)} title="Delete" className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}

              {slashFor === b.id && (
                <div className="absolute z-30 left-0 mt-1 w-64 bg-white rounded-xl border border-slate-200 shadow-xl p-1.5 max-h-72 overflow-y-auto">
                  {COMMANDS.map((c) => (
                    <button key={c.type} onClick={() => setBlockType(b.id, c.type)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 text-left">
                      <span className="w-7 h-7 rounded-lg bg-medical-50 text-medical-600 flex items-center justify-center shrink-0">{c.icon}</span>
                      <span className="min-w-0"><span className="block text-sm font-medium text-slate-700">{c.label}</span><span className="block text-[11px] text-slate-400 truncate">{c.hint}</span></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {!signed && (
            <button onClick={() => addBlock("paragraph", blocks[blocks.length - 1]?.id)} className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-medical-600">
              <Plus className="w-3.5 h-3.5" /> Add a block, or type <kbd className="px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">/</kbd> in an empty note
            </button>
          )}
        </div>
      </div>

      {/* Action bar */}
      {!signed && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-slate-200 px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <button onClick={sign} disabled={signing} className="w-full bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2">
              {signing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />} Sign & route note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BlockView({ block, signed, onText, onSlash, onParseRx, onParseLabs, onToggleCheck, onAddSuggestion }: {
  block: Block; signed: boolean;
  onText: (t: string) => void; onSlash: () => void; onParseRx: () => void;
  onParseLabs: (t: string) => void; onToggleCheck: () => void; onAddSuggestion: (s: string) => void;
}) {
  const text = block.text ?? "";
  const title = SECTION_TITLE[block.type];
  const chips = suggestionsFor(block.type);

  if (block.type === "divider") return <hr className="my-3 border-slate-200" />;

  if (block.type === "heading") {
    return <AutoTextarea value={text} onChange={onText} onSlash={onSlash} placeholder="Heading" className="text-lg font-bold text-slate-900 py-1.5" />;
  }

  if (block.type === "checklist") {
    return (
      <div className="flex items-start gap-2 py-1">
        <button onClick={onToggleCheck} className={`mt-1 w-4 h-4 rounded border shrink-0 flex items-center justify-center ${block.data?.checked ? "bg-medical-600 border-medical-600" : "border-slate-300"}`}>
          {block.data?.checked && <CheckSquare className="w-3 h-3 text-white" />}
        </button>
        <AutoTextarea value={text} onChange={onText} onSlash={onSlash} placeholder="To-do" className={`text-sm py-0.5 ${block.data?.checked ? "line-through text-slate-400" : "text-slate-700"}`} />
      </div>
    );
  }

  if (block.type === "prescription") {
    const parsed = block.data?.parsed ?? [];
    return (
      <Section title={title!} accent="medical">
        <AutoTextarea
          value={text} onChange={onText} onSlash={onSlash}
          placeholder="e.g. tabs pcm 1g tds x 5/7&#10;cap amoxil 500mg bd x 7/7"
          className="text-sm text-slate-700 font-mono leading-relaxed py-1"
        />
        {!signed && (
          <button onClick={onParseRx} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-medical-600 hover:text-medical-700">
            <Sparkles className="w-3 h-3" /> Convert to table
          </button>
        )}
        {parsed.length > 0 && (
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-400"><tr>
                <th className="text-left font-semibold px-2 py-1.5">Drug</th>
                <th className="text-left font-semibold px-2 py-1.5">Dose</th>
                <th className="text-left font-semibold px-2 py-1.5">Freq</th>
                <th className="text-left font-semibold px-2 py-1.5">Duration</th>
              </tr></thead>
              <tbody>
                {parsed.map((it, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-medium text-slate-700">{it.form ? `${it.form} ` : ""}{it.drug_name}</td>
                    <td className="px-2 py-1.5 text-slate-600">{it.strength ?? it.dose ?? "—"}</td>
                    <td className="px-2 py-1.5 text-slate-600">{it.frequency ?? "—"}{it.frequency_per_day ? ` (${it.frequency_per_day}/day)` : ""}</td>
                    <td className="px-2 py-1.5 text-slate-600">{it.duration_days != null ? `${it.duration_days}d` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    );
  }

  if (block.type === "lab_order") {
    const tests = block.data?.tests ?? [];
    return (
      <Section title={title!} accent="violet">
        <AutoTextarea
          value={text} onChange={(t) => onParseLabs(t)} onSlash={onSlash}
          placeholder="e.g. FBC, U&E, Malaria parasite, LFT"
          className="text-sm text-slate-700 py-1"
        />
        {tests.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tests.map((t, i) => <span key={i} className="text-[11px] bg-violet-50 text-violet-700 rounded-full px-2 py-0.5">{t}</span>)}
          </div>
        )}
      </Section>
    );
  }

  // history / examination / diagnosis / plan / paragraph
  return (
    <Section title={title}>
      <AutoTextarea value={text} onChange={onText} onSlash={onSlash} placeholder={title ? `${title}…` : "Write…"} className="text-sm text-slate-700 leading-relaxed py-1" />
      {!signed && chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button key={c} onClick={() => onAddSuggestion(c)} className="text-[11px] bg-slate-50 hover:bg-medical-50 text-slate-500 hover:text-medical-600 rounded-full px-2 py-0.5 border border-slate-100">+ {c}</button>
          ))}
        </div>
      )}
    </Section>
  );
}

function Section({ title, accent, children }: { title?: string; accent?: "medical" | "violet"; children: React.ReactNode }) {
  if (!title) return <div className="py-0.5">{children}</div>;
  const color = accent === "violet" ? "text-violet-600" : accent === "medical" ? "text-medical-600" : "text-slate-400";
  return (
    <div className="py-1.5">
      <p className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${color}`}>{title}</p>
      {children}
    </div>
  );
}
