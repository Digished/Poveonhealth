import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PoveonLogo } from "@/components/PoveonLogo";
import Link from "next/link";

interface Props {
  params: { code: string };
}

function parsePhones(phones: unknown): string[] {
  if (Array.isArray(phones)) return phones as string[];
  if (typeof phones === "string") {
    try { const p = JSON.parse(phones); return Array.isArray(p) ? p : [phones]; } catch { return [phones]; }
  }
  return [];
}

function parseWhatsApp(wa: string | null | undefined): string[] {
  if (!wa) return [];
  try { const p = JSON.parse(wa); return Array.isArray(p) ? p.filter(Boolean) : [wa]; } catch { return [wa]; }
}

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  incoming: { label: "Pending – Request received", color: "bg-amber-50 text-amber-700 border border-amber-200", dot: "bg-amber-400" },
  seen: { label: "Patient Arrived at Lab", color: "bg-blue-50 text-blue-700 border border-blue-200", dot: "bg-blue-400" },
  done: { label: "Tests Completed", color: "bg-emerald-50 text-emerald-700 border border-emerald-200", dot: "bg-emerald-500" },
};

const SCHEDULE_LABELS: Record<string, string> = {
  today: "Today",
  this_week: "This week",
  this_month: "This month",
  not_sure: "Not yet decided",
};

export default async function RequestDetailPage({ params }: Props) {
  const code = params.code.toUpperCase();

  const request = await prisma.request.findUnique({
    where: { code },
    include: {
      lab: {
        select: {
          name: true,
          address: true,
          phones: true,
          whatsapp: true,
          logo_url: true,
          description: true,
        },
      },
    },
  });

  if (!request) notFound();

  const { lab } = request;
  const phones = parsePhones(lab.phones);
  const whatsapps = parseWhatsApp(lab.whatsapp);
  const st = STATUS_MAP[request.status] ?? STATUS_MAP.incoming;
  const tests = request.tests && request.tests !== "See attached image"
    ? request.tests.split(/[,\n]/).map((t) => t.trim()).filter(Boolean)
    : [];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/60 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PoveonLogo className="w-5 h-5 opacity-60" />
            <span className="text-xs text-slate-400 font-medium">Powered by Poveon</span>
          </div>
          <Link
            href="/login"
            className="text-xs font-semibold text-sky-600 hover:text-sky-800 transition"
          >
            Patient Portal →
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-5 pb-28">
        {/* Status card */}
        <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${st.color}`}>
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot} animate-pulse`} />
          <p className="text-sm font-semibold">{st.label}</p>
        </div>

        {/* Patient instructions */}
        {request.status === "incoming" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">What to do next</p>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                <p className="text-sm text-slate-700">Visit <span className="font-semibold">{lab.name}</span> at the address shown below.</p>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <p className="text-sm text-slate-700">
                  Tell the lab your request code:{" "}
                  <span className="inline-block font-mono font-bold text-base bg-slate-100 text-slate-800 px-3 py-0.5 rounded-lg tracking-widest">{code}</span>
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                <p className="text-sm text-slate-700">The lab will run your tests and update your status here.</p>
              </li>
            </ol>
          </div>
        )}

        {/* Lab card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-3 mb-4">
            {lab.logo_url ? (
              <img src={lab.logo_url} alt={lab.name} className="w-12 h-12 rounded-xl object-cover border border-slate-100 shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-bold text-slate-800 text-lg leading-tight">{lab.name}</h1>
              {lab.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{lab.description}</p>}
            </div>
          </div>

          {lab.address && (
            <div className="flex items-start gap-2 mb-3">
              <svg className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm text-slate-600">{lab.address}</p>
            </div>
          )}

          {phones.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {phones.map((p, i) => (
                <a key={i} href={`tel:${p}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full transition">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" />
                  </svg>
                  {p}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Tests card */}
        {(tests.length > 0 || request.test_image_url) && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Tests Requested</p>
            {tests.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tests.map((t, i) => (
                  <span key={i} className="text-sm bg-sky-50 text-sky-700 border border-sky-100 px-3 py-1 rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">See attached test request image</p>
            )}
            {request.test_image_url && (
              <a
                href={request.test_image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-blue-600 hover:text-blue-800 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                View test request image
              </a>
            )}
          </div>
        )}

        {/* Schedule */}
        {request.schedule && SCHEDULE_LABELS[request.schedule] && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-5 py-4 flex items-center gap-3">
            <svg className="w-5 h-5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div>
              <p className="text-xs text-slate-400 font-medium">Preferred visit</p>
              <p className="text-sm font-semibold text-slate-700">{SCHEDULE_LABELS[request.schedule]}</p>
            </div>
          </div>
        )}

        {/* Portal CTA */}
        <div className="bg-gradient-to-br from-sky-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
          <p className="font-bold text-base mb-1">Manage your test requests</p>
          <p className="text-sm text-sky-100 mb-4">Log in to your patient portal to track results, update your details, and view your test history.</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-white text-sky-700 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-sky-50 transition shadow"
          >
            Open Patient Portal
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </main>

      {/* FAB — all WhatsApp + Call floating buttons */}
      {(whatsapps.length > 0 || phones.length > 0) && (
        <div className="fixed bottom-6 right-4 flex flex-col gap-2 z-50">
          {phones.map((p, i) => (
            <a
              key={i}
              href={`tel:${p}`}
              className="w-14 h-14 rounded-full bg-white border border-slate-200 shadow-xl flex items-center justify-center hover:bg-slate-50 transition active:scale-95"
              title={`Call ${p}`}
            >
              <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" />
              </svg>
            </a>
          ))}
          {whatsapps.map((wa, i) => (
            <a
              key={i}
              href={`https://wa.me/${wa.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-14 h-14 rounded-full bg-green-500 shadow-xl shadow-green-500/30 flex items-center justify-center hover:bg-green-600 transition active:scale-95"
              title={`WhatsApp ${wa}`}
            >
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
