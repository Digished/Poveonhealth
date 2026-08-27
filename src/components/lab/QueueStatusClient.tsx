"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, MapPin, Phone, Copy, Hourglass, CreditCard, UserCheck } from "lucide-react";
import { fetchJson } from "@/lib/poll";

interface StatusData {
  code: string;
  first_name: string | null;
  stage: "waiting" | "paid" | "attended";
  queue_number: number | null;
  ahead: number | null;
  position: number | null;
  lab: {
    name: string;
    address: string;
    logo_url: string | null;
    description: string;
    phones: { number: string; label: string }[];
  };
}

const STAGES = [
  { key: "waiting", label: "Registered", icon: Hourglass },
  { key: "paid", label: "Payment made", icon: CreditCard },
  { key: "attended", label: "Attended to", icon: UserCheck },
] as const;

function stageIndex(stage: StatusData["stage"]): number {
  return stage === "attended" ? 2 : stage === "paid" ? 1 : 0;
}

/**
 * The client's personalised live queue page. Polls every 6 seconds so their
 * position ticks down in real time (no refresh) as the lab attends to the
 * people ahead, and follows them through registered → paid → attended.
 */
export function QueueStatusClient({ code }: { code: string }) {
  const [data, setData] = useState<StatusData | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<StatusData & { success: boolean }>(`/api/onboard/queue-status?code=${encodeURIComponent(code)}`);
      if (d === null) return; // 304 — position and stage unchanged
      if (d.success) { setData(d); setFailed(false); }
      else if (!data) setFailed(true);
    } catch {
      if (!data) setFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    load();
    // 15s is well inside "live" for a waiting room, at 2.5× fewer requests.
    const id = setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => clearInterval(id);
  }, [load]);

  if (failed && !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-medical-50 px-4">
        <p className="text-sm text-slate-500">We couldn&apos;t find this registration. Please check with the front desk.</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-medical-50">
        <Loader2 className="h-6 w-6 animate-spin text-medical-500" />
      </main>
    );
  }

  const idx = stageIndex(data.stage);
  const attended = data.stage === "attended";
  const next = data.ahead === 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-medical-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        {/* Lab identity */}
        <div className="text-center">
          {data.lab.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.lab.logo_url} alt={data.lab.name} className="mx-auto h-14 w-14 rounded-2xl object-contain" />
          ) : (
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-medical-600 text-xl font-bold text-white">
              {data.lab.name.charAt(0)}
            </div>
          )}
          <h1 className="mt-3 text-xl font-bold text-slate-900">{data.lab.name}</h1>
        </div>

        {/* Thank you + live position */}
        <div className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm">
          {attended ? (
            <>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-7 w-7 text-emerald-600" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                {data.first_name ? `Thank you, ${data.first_name}!` : "Thank you!"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                You&apos;ve been attended to. Thank you for choosing {data.lab.name} — we wish you the very best of health.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-900">
                {data.first_name ? `Thank you, ${data.first_name}!` : "Thank you!"} 🎉
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                You&apos;re registered at {data.lab.name}. Keep this page open — your position updates by itself.
              </p>
              <div className="mx-auto mt-5 flex h-28 w-28 flex-col items-center justify-center rounded-full border-4 border-medical-100 bg-medical-50">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-medical-500">{next ? "You're" : "Position"}</span>
                <span className="text-4xl font-extrabold leading-none text-medical-700">{next ? "next" : data.position}</span>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                {next
                  ? "Please stay close — you'll be called any moment now."
                  : `${data.ahead} ${data.ahead === 1 ? "person is" : "people are"} ahead of you.`}
              </p>
              <p className="mt-1 text-xs text-slate-400">Your position moves up automatically as the clients ahead of you are attended to.</p>
            </>
          )}

          {/* Journey stages */}
          <div className="mt-6 flex items-center gap-2">
            {STAGES.map((s, i) => {
              const Icon = s.icon;
              const doneStage = i < idx || attended;
              const active = i === idx && !attended;
              return (
                <div key={s.key} className="flex flex-1 items-center gap-2 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${doneStage ? "bg-emerald-500 text-white" : active ? "bg-medical-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                      {doneStage ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className={`mt-1 whitespace-nowrap text-[10px] font-medium ${doneStage || active ? "text-slate-700" : "text-slate-400"}`}>{s.label}</span>
                  </div>
                  {i < STAGES.length - 1 && <div className={`mb-4 h-0.5 flex-1 rounded ${i < idx || attended ? "bg-emerald-400" : "bg-slate-100"}`} />}
                </div>
              );
            })}
          </div>

          {/* Code */}
          <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
            <span className="font-mono text-lg font-bold tracking-wider text-medical-700">{data.code}</span>
            <button
              onClick={() => { navigator.clipboard?.writeText(data.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="text-slate-400 hover:text-slate-600"
              title="Copy code"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Show this code if the team asks for it.</p>
        </div>

        {/* Lab details */}
        <div className="mt-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">About {data.lab.name}</p>
          {data.lab.description && <p className="mt-2 text-sm leading-relaxed text-slate-600">{data.lab.description}</p>}
          {data.lab.address && (
            <p className="mt-3 flex items-start gap-2 text-sm text-slate-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-medical-500" /> {data.lab.address}
            </p>
          )}
          {data.lab.phones.map((p) => (
            <a key={p.number} href={`tel:${p.number}`} className="mt-2 flex items-center gap-2 text-sm text-medical-600 hover:text-medical-700">
              <Phone className="h-4 w-4 shrink-0" /> {p.label ? `${p.label}: ` : ""}{p.number}
            </a>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">Powered by Poveon Health</p>
      </div>
    </main>
  );
}
