"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PoveonLogo } from "@/components/PoveonLogo";
import { LogOut, Phone, MapPin, Calendar, Stethoscope, FlaskConical, ClipboardList } from "lucide-react";

interface Lab {
  name: string;
  address?: string;
  whatsapp?: string;
  phones?: string[];
}

interface LabRequest {
  id: string;
  requestCode: string;
  patientName: string;
  status: "incoming" | "seen" | "done";
  tests: string[];
  schedule?: string;
  diagnosis?: string;
  createdAt: string;
  lab: Lab;
}

interface MeResponse {
  email: string;
  requests: LabRequest[];
}

function statusLabel(status: LabRequest["status"]) {
  switch (status) {
    case "incoming":
      return { label: "Pending", className: "bg-amber-100 text-amber-700 border border-amber-200" };
    case "seen":
      return { label: "At Lab", className: "bg-blue-100 text-blue-700 border border-blue-200" };
    case "done":
      return { label: "Completed", className: "bg-emerald-100 text-emerald-700 border border-emerald-200" };
    default:
      return { label: status, className: "bg-slate-100 text-slate-600 border border-slate-200" };
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function whatsappDigits(raw: string) {
  return raw.replace(/\D/g, "");
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-100 rounded" />
        </div>
        <div className="h-6 w-20 bg-slate-100 rounded-full" />
      </div>
      <div className="h-3 w-48 bg-slate-100 rounded mb-2" />
      <div className="h-3 w-36 bg-slate-100 rounded mb-4" />
      <div className="flex gap-2">
        <div className="h-3 w-24 bg-slate-100 rounded" />
        <div className="h-3 w-24 bg-slate-100 rounded" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/patient/me")
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const json = await res.json();
        setData(json);
      })
      .catch(() => {
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/patient/logout", { method: "POST" });
    } catch {
      // ignore network errors, redirect anyway
    }
    router.replace("/login");
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/60 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center shadow flex-shrink-0">
              <ClipboardList className="w-4 h-4 text-sky-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-800 leading-tight">My Tests</h1>
              {data?.email && (
                <p className="text-xs text-slate-400 truncate">{data.email}</p>
              )}
            </div>
          </div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition px-3 py-1.5 rounded-lg hover:bg-red-50 flex-shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : data && data.requests.length > 0 ? (
          data.requests.map((req) => {
            const { label, className: badgeClass } = statusLabel(req.status);
            const waDigits = req.lab.whatsapp ? whatsappDigits(req.lab.whatsapp) : null;

            return (
              <div
                key={req.id}
                className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow"
              >
                {/* Top row: name + status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm leading-tight">{req.patientName}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{req.requestCode}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${badgeClass}`}>
                    {label}
                  </span>
                </div>

                {/* Lab info */}
                <div className="flex items-start gap-1.5 mb-1">
                  <FlaskConical className="w-3.5 h-3.5 text-sky-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-medium text-slate-700">{req.lab.name}</p>
                </div>
                {req.lab.address && (
                  <div className="flex items-start gap-1.5 mb-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-slate-500">{req.lab.address}</p>
                  </div>
                )}

                {/* Tests */}
                {req.tests.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Tests</p>
                    <div className="flex flex-wrap gap-1.5">
                      {req.tests.map((test, i) => (
                        <span
                          key={i}
                          className="text-xs bg-sky-50 text-sky-700 border border-sky-100 px-2 py-0.5 rounded-full"
                        >
                          {test}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Schedule */}
                {req.schedule && (
                  <div className="flex items-center gap-1.5 mt-3">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                    <p className="text-xs text-slate-600">
                      <span className="font-medium">Schedule:</span> {req.schedule}
                    </p>
                  </div>
                )}

                {/* Diagnosis */}
                {req.diagnosis && (
                  <div className="flex items-start gap-1.5 mt-2">
                    <Stethoscope className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-slate-600">
                      <span className="font-medium">Diagnosis:</span> {req.diagnosis}
                    </p>
                  </div>
                )}

                {/* Footer: date + contact */}
                <div className="mt-4 pt-3 border-t border-slate-50 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">{formatDate(req.createdAt)}</p>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Phone numbers */}
                    {req.lab.phones && req.lab.phones.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {req.lab.phones.map((phone, i) => (
                          <a
                            key={i}
                            href={`tel:${phone}`}
                            className="text-xs text-slate-500 hover:text-slate-700 transition"
                          >
                            {phone}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* WhatsApp button */}
                    {waDigits && (
                      <a
                        href={`https://wa.me/${waDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-green-500 hover:bg-green-600 transition px-3 py-1.5 rounded-full shadow-sm"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center mb-4">
              <ClipboardList className="w-8 h-8 text-slate-300" />
            </div>
            <h2 className="text-slate-700 font-semibold text-base mb-1">No test requests found</h2>
            <p className="text-slate-400 text-sm max-w-xs">
              No test requests found for your email address.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="pb-8 pt-2 flex items-center justify-center gap-1.5">
        <PoveonLogo className="w-4 h-4 opacity-30" />
        <span className="text-xs text-slate-400">Powered by Poveon</span>
      </footer>
    </div>
  );
}
