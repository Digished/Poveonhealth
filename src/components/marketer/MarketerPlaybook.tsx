"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  Flame, Moon, ThumbsUp, Clock, MessageCircle, Phone, Copy, CheckSquare, Square,
  Rocket, BarChart3, ChevronDown, ChevronUp,
} from "lucide-react";
import { SCRIPTS, ACTIVATION_STEPS, fillScript } from "@/lib/marketer/playbook-content";
import { waLink, telLink, firstName } from "./contact-links";
import { ProofCard } from "./ProofCard";

interface Item { email: string; name: string; phone: string | null; hospital: string | null; reason: string; detail?: string }
interface Playbook { activate: Item[]; winback: Item[]; thank_expand: Item[]; nudge: Item[] }

type BucketKey = keyof Playbook;
const BUCKETS: { key: BucketKey; label: string; icon: React.ReactNode; tint: string; scriptKey: string }[] = [
  { key: "activate", label: "Activate — get the first request", icon: <Flame className="w-4 h-4" />, tint: "text-orange-600 bg-orange-50", scriptKey: "first_test" },
  { key: "nudge", label: "Nudge — patient hasn't arrived", icon: <Clock className="w-4 h-4" />, tint: "text-amber-600 bg-amber-50", scriptKey: "nudge" },
  { key: "thank_expand", label: "Thank & expand — ask for a referral", icon: <ThumbsUp className="w-4 h-4" />, tint: "text-emerald-600 bg-emerald-50", scriptKey: "thank_referral" },
  { key: "winback", label: "Win back — gone quiet", icon: <Moon className="w-4 h-4" />, tint: "text-blue-600 bg-blue-50", scriptKey: "winback" },
];

export function MarketerPlaybook({ marketerName, marketerCode }: { marketerName: string; marketerCode: string }) {
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [proofEmail, setProofEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scale/playbook")
      .then((r) => r.json())
      .then((d) => { if (d.success) setPlaybook(d.playbook); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-3 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl border border-slate-100" />)}</div>;
  if (!playbook) return <p className="text-center text-sm text-slate-400 py-8">Couldn&apos;t load your playbook.</p>;

  const total = BUCKETS.reduce((s, b) => s + playbook[b.key].length, 0);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-4 text-white">
        <p className="text-sm font-bold">Today&apos;s playbook</p>
        <p className="text-xs text-white/80 mt-0.5">{total === 0 ? "You're all caught up — nice work." : `${total} doctor${total === 1 ? "" : "s"} to action today. Start at the top.`}</p>
        <a href={`/?ref=${encodeURIComponent(marketerCode)}`} target="_blank" rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">
          <Rocket className="w-3.5 h-3.5" /> Send a request (pre-attributed to you)
        </a>
      </div>

      {BUCKETS.map((b) => {
        const items = playbook[b.key];
        if (items.length === 0) return null;
        return (
          <div key={b.key}>
            <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-lg mb-2 ${b.tint}`}>{b.icon}{b.label} · {items.length}</div>
            <div className="space-y-2">
              {items.map((it) => (
                <PlaybookRow
                  key={`${b.key}-${it.email}`}
                  item={it} bucket={b.key} scriptKey={b.scriptKey}
                  marketerName={marketerName} marketerCode={marketerCode}
                  onProof={() => setProofEmail(it.email)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {total === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <ThumbsUp className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">Nothing to chase right now.</p>
          <p className="text-xs text-slate-400 mt-1">Add more doctors or check back tomorrow.</p>
        </div>
      )}

      {proofEmail && <ProofCard doctorEmail={proofEmail} onClose={() => setProofEmail(null)} />}
    </div>
  );
}

function PlaybookRow({ item, bucket, scriptKey, marketerName, marketerCode, onProof }: {
  item: Item; bucket: BucketKey; scriptKey: string; marketerName: string; marketerCode: string; onProof: () => void;
}) {
  const [open, setOpen] = useState(false);
  const script = SCRIPTS.find((s) => s.key === scriptKey) ?? SCRIPTS[0];
  const text = fillScript(script.body, { doctor: firstName(item.name), me: marketerName, detail: item.detail });
  const wa = waLink(item.phone, text);
  const tel = telLink(item.phone);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-bold shrink-0">{firstName(item.name).charAt(0).toUpperCase()}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
          <p className="text-[11px] text-slate-500">{item.reason}</p>
          {item.hospital && <p className="text-[11px] text-slate-400 truncate">{item.hospital}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>}
        {tel && <a href={tel} className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition"><Phone className="w-3.5 h-3.5" /> Call</a>}
        <button onClick={() => { navigator.clipboard?.writeText(text).then(() => toast.success("Script copied")); }} className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition"><Copy className="w-3.5 h-3.5" /> Copy script</button>
        {bucket !== "activate" && <button onClick={onProof} className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition"><BarChart3 className="w-3.5 h-3.5" /> Proof</button>}
        {bucket === "activate" && (
          <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition">
            Checklist {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {bucket === "activate" && open && (
        <ActivationChecklist email={item.email} marketerCode={marketerCode} />
      )}
    </div>
  );
}

function ActivationChecklist({ email, marketerCode }: { email: string; marketerCode: string }) {
  const storageKey = `scale_activation_${marketerCode}_${email}`;
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) setDone(JSON.parse(raw)); } catch { /* ignore */ }
  }, [storageKey]);

  const toggle = useCallback((key: string) => {
    setDone((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-1.5">
      {ACTIVATION_STEPS.map((s) => (
        <button key={s.key} onClick={() => toggle(s.key)} className="w-full flex items-center gap-2 text-left text-xs text-slate-600">
          {done[s.key] ? <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" /> : <Square className="w-4 h-4 text-slate-300 shrink-0" />}
          <span className={done[s.key] ? "line-through text-slate-400" : ""}>{s.label}</span>
        </button>
      ))}
      <a href={`/?ref=${encodeURIComponent(marketerCode)}`} target="_blank" rel="noreferrer"
        className="mt-1 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">
        <Rocket className="w-3.5 h-3.5" /> Start their first request
      </a>
    </div>
  );
}
