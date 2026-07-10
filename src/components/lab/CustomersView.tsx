"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Download, RefreshCw, Users, Check, Clock, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { SourceBadge } from "@/components/lab/SourceBadge";

interface CustomerRow {
  id: string;
  code: string;
  status: string;
  source: string;
  patient_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  patient_age: number | null;
  dob: string | null;
  sex: string | null;
  address: string | null;
  doctor_prefix: string | null;
  doctor_name: string | null;
  doctor_email: string | null;
  doctor_phone: string | null;
  doctor_hospital: string | null;
  tests: string;
  diagnosis: string | null;
  referral_type: string | null;
  policy_number: string | null;
  whatsapp_phone: string | null;
  payment_mode: string | null;
  is_paid: boolean;
  created_at: string;
  seen_at: string | null;
  arrived_at: string | null;
  attended_at: string | null;
  completed_at: string | null;
  attend_date: string | null;
  arrived: boolean;
}

/**
 * Two tabs, no overlap: clients referred through the Poveon app vs everyone
 * who registered at the lab (QR self-service + walk-ins). An app-referred
 * client who fills the QR form on arrival lives in "Registered customers" —
 * keeping the two lists separate avoids duplicate rows.
 */
type SourceTab = "app" | "registered";

const SOURCE_TABS: { key: SourceTab; label: string }[] = [
  { key: "app", label: "App referrals" },
  { key: "registered", label: "Registered customers" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Customers — every customer since inception, split into App referrals and
 * Registered customers (QR self-service + walk-ins). "Arrived" strictly means
 * staff pressed the onboarding "Client has arrived" button. Downloadable as a
 * spreadsheet that mirrors the selected tab and filters. `live` turns the
 * view into an auto-refreshing real-time board (used by the pop-out page).
 */
export function CustomersView({ labName, live = false }: { labName: string; live?: boolean }) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [sourceF, setSourceF] = useState<SourceTab>("app");
  const [arrivedF, setArrivedF] = useState<"" | "arrived" | "not_arrived">("");
  const [query, setQuery] = useState("");

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/lab/customers", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      setRows(data.customers ?? []);
      setUpdatedAt(new Date());
    } catch {
      if (!silent) toast.error("Failed to load customers");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep the table fresh — the live board refreshes every 10s, the normal
  // dashboard tab every 30s.
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) load(true); }, live ? 10000 : 30000);
    return () => clearInterval(id);
  }, [load, live]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const src = r.source ?? "poveon";
      if (sourceF === "app" && src !== "poveon") return false;
      if (sourceF === "registered" && src === "poveon") return false;
      if (arrivedF === "arrived" && !r.arrived) return false;
      if (arrivedF === "not_arrived" && r.arrived) return false;
      if (q) {
        const hay = [r.patient_name, r.patient_phone, r.patient_email, r.code, r.doctor_name, r.tests].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, sourceF, arrivedF, query]);

  const stats = useMemo(() => ({
    total: filtered.length,
    arrived: filtered.filter((r) => r.arrived).length,
    notArrived: filtered.filter((r) => !r.arrived).length,
  }), [filtered]);

  function downloadCsv() {
    const headers = [
      "Name", "Phone", "WhatsApp", "Email", "Age", "Date of Birth", "Sex", "Address",
      "Source", "Referral Type", "Referring Doctor", "Doctor Email", "Doctor Phone", "Hospital / HMO", "Policy Number",
      "Tests", "Complaint / Diagnosis", "Payment Mode", "Paid", "Status", "Code",
      "Referred Date", "Arrived", "Arrived Date", "Attended Date", "Completed Date",
    ];
    const referralLabel: Record<string, string> = { self: "Self referred", doctor: "Doctor / hospital", hmo: "HMO" };
    const sourceLabel: Record<string, string> = { poveon: "App referral", walk_in: "Walk-in", qr: "Self-service QR" };
    const lines = [headers.map(csvEscape).join(",")];
    for (const r of filtered) {
      lines.push([
        r.patient_name,
        r.patient_phone,
        r.whatsapp_phone,
        r.patient_email,
        r.patient_age,
        r.dob,
        r.sex,
        r.address,
        sourceLabel[r.source ?? "poveon"] ?? r.source,
        r.referral_type ? (referralLabel[r.referral_type] ?? r.referral_type) : "",
        [r.doctor_prefix, r.doctor_name].filter(Boolean).join(" "),
        r.doctor_email,
        r.doctor_phone,
        r.doctor_hospital,
        r.policy_number,
        r.tests?.replace(/\n+/g, " "),
        r.diagnosis,
        r.payment_mode,
        r.is_paid ? "Yes" : "No",
        r.status,
        r.code,
        r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : "",
        r.arrived ? "Yes" : "No",
        r.attend_date ? new Date(r.attend_date).toISOString().slice(0, 10) : "",
        r.attended_at ? new Date(r.attended_at).toISOString().slice(0, 10) : "",
        r.completed_at ? new Date(r.completed_at).toISOString().slice(0, 10) : "",
      ].map(csvEscape).join(","));
    }
    // BOM so Excel opens the file with correct encoding. The export mirrors
    // the tab + filters currently on screen.
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const tabSlug = sourceF === "app" ? "app-referrals" : "registered-customers";
    a.download = `${labName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${tabSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Spreadsheet downloaded");
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            Customers
            {live && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Live
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {live
              ? `Updates automatically every 10 seconds${updatedAt ? ` · last update ${updatedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : ""}.`
              : "Every customer since inception — app referrals and clients registered at the lab."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!live && (
            <button
              onClick={() => window.open("/lab-dashboard/customers", "_blank", "noopener")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
              title="Open a live, auto-updating view in a new browser tab"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open live view
            </button>
          )}
          <button
            onClick={() => load(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={downloadCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Download spreadsheet
          </button>
        </div>
      </div>

      {/* Summary — arrived strictly reflects the onboarding "Client has arrived" button */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400"><Users className="h-3.5 w-3.5" /> {sourceF === "app" ? "App referrals" : "Registered"}</p>
          <p className="mt-1 text-2xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-200/80"><Check className="h-3.5 w-3.5" /> Arrived</p>
          <p className="mt-1 text-2xl font-bold text-white">{stats.arrived}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-200/80"><Clock className="h-3.5 w-3.5" /> Not yet arrived</p>
          <p className="mt-1 text-2xl font-bold text-white">{stats.notArrived}</p>
        </div>
      </div>

      {/* Source tabs */}
      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
        {SOURCE_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSourceF(t.key)}
            className={`shrink-0 flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition ${sourceF === t.key ? "bg-medical-600 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + arrived filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, email, code, doctor or test"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none"
          />
        </div>
        <select
          value={arrivedF}
          onChange={(e) => setArrivedF(e.target.value as typeof arrivedF)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer"
        >
          <option value="" className="bg-slate-800">Arrived & not arrived</option>
          <option value="arrived" className="bg-slate-800">Arrived only</option>
          <option value="not_arrived" className="bg-slate-800">Not arrived only</option>
        </select>
      </div>

      {/* Table (horizontal scroll keeps it usable on phones) */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 py-16 text-center text-slate-400">
          <Users className="mx-auto mb-3 h-8 w-8 opacity-40" />
          <p className="text-sm font-medium">No customers match</p>
          <p className="mt-1 text-xs text-slate-500">Try the other tab, a different filter or search term.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="slim-scroll overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-white/5 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-3 py-3 font-semibold">Age</th>
                  <th className="px-3 py-3 font-semibold">Sex</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Referring doctor</th>
                  <th className="px-4 py-3 font-semibold">Tests</th>
                  <th className="px-4 py-3 font-semibold">Referred</th>
                  <th className="px-4 py-3 font-semibold">Arrived</th>
                  <th className="px-4 py-3 font-semibold">Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => (
                  <tr key={r.id} className="bg-white/3 transition-colors hover:bg-white/8">
                    <td className="px-4 py-3">
                      <p className="max-w-[180px] truncate font-medium text-white">{r.patient_name || "—"}</p>
                      {r.address && <p className="max-w-[180px] truncate text-[10px] text-slate-500">{r.address}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">
                      {r.patient_phone || "—"}
                      {r.whatsapp_phone && <p className="text-[10px] text-emerald-400/80">WA: {r.whatsapp_phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300"><p className="max-w-[170px] truncate">{r.patient_email || "—"}</p></td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-300">{r.patient_age ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs capitalize text-slate-300">{r.sex || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3"><SourceBadge source={r.source} /></td>
                    <td className="px-4 py-3 text-xs text-slate-300">
                      <p className="max-w-[160px] truncate">{[r.doctor_prefix, r.doctor_name].filter(Boolean).join(" ") || "—"}</p>
                      {r.doctor_hospital && <p className="max-w-[160px] truncate text-[10px] text-slate-500">{r.doctor_hospital}{r.policy_number ? ` · ${r.policy_number}` : ""}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300"><p className="max-w-[220px] truncate" title={r.tests}>{r.tests?.replace(/\n+/g, " ")}</p></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-300">{fmtDate(r.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      {r.arrived ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-300"><Check className="h-3 w-3" /> {fmtDate(r.attend_date)}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-300"><Clock className="h-3 w-3" /> Not arrived</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">{r.code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        Showing {filtered.length} record{filtered.length !== 1 ? "s" : ""} in {sourceF === "app" ? "App referrals" : "Registered customers"}.
        The spreadsheet download matches this tab and the filters above, with every column included (address, complaint, payment mode, policy number and more).
      </p>
    </div>
  );
}
