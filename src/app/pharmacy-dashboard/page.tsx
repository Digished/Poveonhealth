"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BadgeCheck, Check, Loader2, LogOut, Pill, Plus, Search, ShieldAlert,
  TicketPercent, Users, Wallet, X,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { SectionLoader } from "@/components/PageLoader";
import { toast } from "react-hot-toast";
import { Download } from "lucide-react";
import { Modal } from "@/components/ui/Overlay";
import { MonthFilter } from "@/components/ui/MonthFilter";
import { conditionLabel } from "@/lib/consult-conditions";
import { PriceListPanel } from "@/components/pharmacy/PriceListPanel";

type Pharmacy = {
  id: string; name: string; code: string; email: string; phone: string | null;
  address: string | null; city: string | null; state: string | null; discount_percent: number;
};
type Stats = {
  customers: number; care_plan_customers: number; redemptions_this_month: number;
  gross_this_month: number; discount_this_month: number;
};
type Customer = {
  id: string; full_name: string; phone: string | null; code: string | null;
  on_care_plan: boolean; visits: number; total_spend: number; last_visit_at: string | null;
  notes: string | null;
};

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function PharmacyDashboard() {
  const router = useRouter();
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"serve" | "customers" | "care" | "prices">("serve");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pharmacy/me", { cache: "no-store" });
      if (res.status === 401) { router.replace("/pharmacy-login"); return; }
      const data = await res.json();
      if (!data.success) return;
      setPharmacy(data.pharmacy);
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function signOut() {
    await fetch("/api/pharmacy/logout", { method: "POST" });
    router.replace("/pharmacy-login");
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-emerald-50 via-white to-sky-50">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600">
            <Pill className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-800">{pharmacy?.name ?? "Pharmacy"}</p>
            <p className="truncate text-xs text-slate-400">
              {pharmacy ? `Code ${pharmacy.code} · ${pharmacy.discount_percent}% member discount` : " "}
            </p>
          </div>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {loading && <SectionLoader label="Loading your pharmacy…" />}

        {!loading && pharmacy && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat icon={<Users className="h-4 w-4" />} label="Customers tracked" value={String(stats?.customers ?? 0)} />
              <Stat icon={<BadgeCheck className="h-4 w-4" />} label="On the care plan" value={String(stats?.care_plan_customers ?? 0)} accent="emerald" />
              <Stat icon={<TicketPercent className="h-4 w-4" />} label="Discounts this month" value={String(stats?.redemptions_this_month ?? 0)} />
              <Stat icon={<Wallet className="h-4 w-4" />} label="Sales this month" value={naira(stats?.gross_this_month ?? 0)} accent="emerald" />
            </div>

            <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-slate-200 pb-2">
              {([
                ["serve", "Serve a member"],
                ["care", "Coming to you"],
                ["prices", "Price list"],
                ["customers", "My customers"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                    tab === key
                      ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
                      : "text-slate-500 hover:bg-white hover:text-slate-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "serve" && <ServePanel onRecorded={load} />}
            {tab === "care" && <CareMembersPanel />}
            {tab === "prices" && <PriceListPanel />}
            {tab === "customers" && <CustomersPanel onChanged={load} />}
          </>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-slate-400">
        <Link href="/consults" className="inline-flex items-center gap-1.5 hover:text-slate-600">
          <PoveonLogo className="h-4 w-4 opacity-50" />
          About the Poveon Care Plan
        </Link>
      </footer>
    </div>
  );
}

function Stat({
  icon, label, value, accent = "slate",
}: {
  icon: React.ReactNode; label: string; value: string; accent?: "slate" | "emerald";
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          accent === "emerald" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
        }`}
      >
        {icon}
      </div>
      <p className="mt-2.5 text-xl font-extrabold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

/** Look a care code up, then record the discounted sale against it. */
function ServePanel({ onRecorded }: { onRecorded: () => void }) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [lookup, setLookup] = useState<
    | { state: "idle" }
    | { state: "invalid"; reason: string; name?: string }
    | {
        state: "valid";
        name: string;
        discount: number;
        expires_at: string | null;
        prescriptions: ScheduledMed[];
      }
  >({ state: "idle" });
  // What the counter ticks off: one outcome per scheduled medication.
  const [outcomes, setOutcomes] = useState<Record<string, MedOutcome>>({});
  const [gross, setGross] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<{ name: string; gross: number; discount: number; payable: number } | null>(null);

  async function check() {
    if (checking || code.trim().length < 4) return;
    setChecking(true);
    setReceipt(null);
    try {
      const res = await fetch("/api/pharmacy/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!data.success) { setLookup({ state: "invalid", reason: data.error ?? "Could not check that code." }); return; }
      if (!data.found || !data.valid) {
        setLookup({ state: "invalid", reason: data.reason ?? "That code is not valid.", name: data.member?.full_name });
        return;
      }
      const prescriptions: ScheduledMed[] = data.prescriptions ?? [];
      setLookup({
        state: "valid",
        name: data.member.full_name,
        discount: data.discount_percent,
        expires_at: data.member.expires_at,
        prescriptions,
      });
      // Default to "collected": the common case is that they take everything.
      setOutcomes(Object.fromEntries(prescriptions.map((p) => [p.id, "collected" as MedOutcome])));
    } catch {
      setLookup({ state: "invalid", reason: "Network error. Please try again." });
    } finally {
      setChecking(false);
    }
  }

  async function record() {
    if (saving || lookup.state !== "valid" || !gross) return;
    setSaving(true);
    try {
      const scheduled = lookup.state === "valid" ? lookup.prescriptions : [];
      const memberName = lookup.state === "valid" ? lookup.name : "";

      // With a schedule on file, say what happened to each line — that is what
      // tells the doctor whether their patient actually got their tablets.
      const endpoint = scheduled.length ? "/api/pharmacy/dispense" : "/api/pharmacy/redeem";
      const body = scheduled.length
        ? {
            code: code.trim(),
            gross_naira: Number(gross),
            items: scheduled.map((p) => ({
              prescription_id: p.id,
              status: outcomes[p.id] ?? "collected",
            })),
          }
        : { code: code.trim(), gross_naira: Number(gross), description: description || null };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { toast.error(data.error ?? "Could not record that."); return; }

      setReceipt({
        name: data.member?.full_name ?? memberName,
        gross: Number(gross),
        discount: data.discount_naira,
        payable: data.payable_naira,
      });
      setCode(""); setGross(""); setDescription(""); setOutcomes({}); setLookup({ state: "idle" });
      onRecorded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">Check a care code</h2>
        <p className="mt-1 text-xs text-slate-500">
          Ask for the member&apos;s code, confirm it&apos;s live, then record the sale so their savings and your
          customer book stay up to date.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setLookup({ state: "idle" }); }}
            onKeyDown={(e) => { if (e.key === "Enter") check(); }}
            placeholder="PVC-XXXXXXX"
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-slate-800 placeholder-slate-300 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          />
          <button
            onClick={check}
            disabled={checking || code.trim().length < 4}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Check
          </button>
        </div>

        {lookup.state === "invalid" && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-800">{lookup.reason}</p>
              {lookup.name && <p className="text-xs text-amber-700">Code belongs to {lookup.name}.</p>}
            </div>
          </div>
        )}

        {lookup.state === "valid" && (
          <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-2.5">
              <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-bold text-emerald-900">{lookup.name} is covered</p>
                <p className="text-xs text-emerald-700">
                  {lookup.discount}% off · valid to {formatDate(lookup.expires_at)}
                </p>
              </div>
            </div>

            {lookup.prescriptions.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-white p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                  Their doctor has them on
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Mark what they actually left with — their doctor sees this.
                </p>
                <ul className="mt-2.5 space-y-2">
                  {lookup.prescriptions.map((p) => (
                    <li key={p.id} className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-sm font-semibold text-slate-800">
                        {p.form ? `${p.form.charAt(0).toUpperCase()}${p.form.slice(1)} · ` : ""}
                        {p.medication}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {[p.dosage, p.frequency].filter(Boolean).join(" · ") || "No dose recorded"}
                        {p.duration_days ? ` · ${p.duration_days} days` : " · ongoing"}
                      </p>
                      {p.last_fulfilment && (
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          Last {MED_OUTCOME_LABEL[p.last_fulfilment.status] ?? p.last_fulfilment.status}
                          {p.last_fulfilment.here ? " here" : " elsewhere"} on{" "}
                          {formatDate(p.last_fulfilment.at)}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {MED_OUTCOMES.map((o) => {
                          const on = (outcomes[p.id] ?? "collected") === o.value;
                          return (
                            <button
                              key={o.value}
                              onClick={() => setOutcomes((prev) => ({ ...prev, [p.id]: o.value }))}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                                on ? "bg-emerald-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:ring-slate-300"
                              }`}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <input
              inputMode="numeric"
              value={gross}
              onChange={(e) => setGross(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Total before discount (₦)"
              className="w-full rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
            />
            {lookup.prescriptions.length === 0 && (
              <input
                value={description}
                maxLength={300}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What did they buy? (optional)"
                className="w-full rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              />
            )}
            {gross && (
              <p className="text-xs text-emerald-800">
                They pay{" "}
                <strong>{naira(Number(gross) - Math.round((Number(gross) * lookup.discount) / 100))}</strong>{" "}
                (saving {naira(Math.round((Number(gross) * lookup.discount) / 100))})
              </p>
            )}
            <button
              onClick={record}
              disabled={saving || !gross}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {lookup.prescriptions.length ? "Record what they collected" : "Record this sale"}
            </button>
          </div>
        )}

        {receipt && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-800">Recorded for {receipt.name}</p>
            <dl className="mt-2 space-y-1 text-xs text-slate-600">
              <div className="flex justify-between"><dt>Before discount</dt><dd>{naira(receipt.gross)}</dd></div>
              <div className="flex justify-between text-emerald-700"><dt>Member saved</dt><dd>−{naira(receipt.discount)}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-800">
                <dt>They pay</dt><dd>{naira(receipt.payable)}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">How the care plan works for you</h2>
        <ul className="mt-3 space-y-3 text-sm text-slate-600">
          <li className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">1</span>
            A member shows their care code at your counter.
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">2</span>
            You check it here — it tells you instantly whether their plan is live.
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">3</span>
            You apply the discount and record the sale. They come back to you, because that&apos;s where their code works.
          </li>
        </ul>
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
          Members on the plan are managing hypertension or diabetes — they refill month after month. Every
          sale you record builds the customer list on the next tab.
        </p>
      </div>
    </div>
  );
}

function CustomersPanel({ onChanged }: { onChanged: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState("");
  const [carePlanOnly, setCarePlanOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async (nextPage = 1, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage) });
      if (q.trim()) params.set("q", q.trim());
      if (carePlanOnly) params.set("care_plan", "1");
      const res = await fetch(`/api/pharmacy/customers?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.success) return;
      setCustomers((prev) => (append ? [...prev, ...data.customers] : data.customers));
      setTotal(data.total);
      setHasMore(data.has_more);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }, [q, carePlanOnly]);

  useEffect(() => {
    const t = setTimeout(() => load(1, false), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone or care code…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          />
        </div>
        <button
          onClick={() => setCarePlanOnly((v) => !v)}
          className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
            carePlanOnly
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          Care plan only
        </button>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-900"
        >
          <Plus className="h-3.5 w-3.5" />
          Add walk-in
        </button>
      </div>

      {adding && (
        <AddCustomerForm
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); load(1, false); onChanged(); }}
        />
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading && customers.length === 0 ? (
          <SectionLoader />
        ) : customers.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-slate-200" />
            <p className="text-sm font-semibold text-slate-600">No customers yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Record a sale against a care code, or add a walk-in, and they&apos;ll show up here.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                    <th className="px-4 py-2.5 font-semibold">Customer</th>
                    <th className="px-4 py-2.5 font-semibold">Visits</th>
                    <th className="px-4 py-2.5 font-semibold">Spend</th>
                    <th className="px-4 py-2.5 font-semibold">Last visit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {customers.map((c) => (
                    <tr key={c.id} className="transition hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-700">{c.full_name}</span>
                          {c.on_care_plan && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              <BadgeCheck className="h-3 w-3" />
                              Care plan
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">
                          {c.phone || "No phone"}
                          {c.code && <span className="ml-2 font-mono">{c.code}</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{c.visits}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{naira(c.total_spend)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(c.last_visit_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-400">
                Showing {customers.length} of {total}
              </p>
              {hasMore && (
                <button
                  onClick={() => load(page + 1, true)}
                  disabled={loading}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-50"
                >
                  {loading ? "Loading…" : "Show more"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AddCustomerForm({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [spend, setSpend] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (saving || fullName.trim().length < 2) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/pharmacy/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          spend_naira: spend ? Number(spend) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error ?? "Could not add that customer."); return; }
      onAdded();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">Add a walk-in customer</h3>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (optional)"
          className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
        />
        <input
          inputMode="numeric"
          value={spend}
          onChange={(e) => setSpend(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="Spend today (₦)"
          className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        onClick={save}
        disabled={saving || fullName.trim().length < 2}
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add customer
      </button>
    </div>
  );
}


// ── Members who chose this pharmacy ─────────────────────────────────────────

type CareMember = {
  id: string;
  code: string | null;
  name: string;
  name_revealed: boolean;
  conditions: string[];
  expires_at: string | null;
  prescriptions: {
    id: string; medication: string; form: string | null; dosage: string | null;
    frequency: string | null; duration_days: number | null;
    start_date: string | null; end_date: string | null; status: string;
    /** When they are next expected for it — what the month filter reads. */
    refill_due: string | null;
  }[];

};

/**
 * The care-plan members who named this pharmacy, and what their doctors have
 * scheduled for them.
 *
 * Names are shortened until someone has actually been served here — naming a
 * preferred pharmacy is a heads-up, not an introduction. The code is what
 * matters at the counter, and it is shown in full.
 */
function CareMembersPanel() {
  const [members, setMembers] = useState<CareMember[]>([]);
  const [summary, setSummary] = useState<{ members: number; pending_prescriptions: number } | null>(null);
  const [months, setMonths] = useState<{ month: string; count: number }[]>([]);
  const [month, setMonth] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pharmacy/care-members", { cache: "no-store" });
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok || !d.success) setError(d.error ?? "Could not load your members.");
        else { setMembers(d.members); setSummary(d.summary); setMonths(d.months ?? []); }
      } catch {
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="h-48 animate-pulse rounded-2xl border border-slate-100 bg-white" />;
  if (error) {
    return <p className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-600">{error}</p>;
  }
  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
        <Users className="mx-auto mb-3 h-10 w-10 text-slate-200" />
        <p className="text-sm font-semibold text-slate-600">Nobody has picked you yet</p>
        <p className="mt-1 text-xs text-slate-400">
          Care-plan members choose a pharmacy when they join. When they pick you, what their doctor
          has scheduled shows up here so you can stock ahead.
        </p>
      </div>
    );
  }

  /** Only the lines due in the chosen month, when one is chosen. */
  const visibleRx = (m: CareMember) =>
    month ? m.prescriptions.filter((rx) => (rx.refill_due ?? "").startsWith(month)) : m.prescriptions;
  const shown = month ? members.filter((m) => visibleRx(m).length > 0) : members;

  return (
    <div className="space-y-3">
      <PharmacyQrCard />

      {months.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Refills due
          </p>
          <MonthFilter
            months={months}
            value={month}
            onChange={setMonth}
            allCount={summary?.pending_prescriptions ?? 0}
          />
        </div>
      )}

      <p className="text-xs text-slate-500">
        {summary?.members} member{summary?.members === 1 ? "" : "s"} chose you ·{" "}
        {summary?.pending_prescriptions} medication{summary?.pending_prescriptions === 1 ? "" : "s"} scheduled.
        Names are shortened until someone has been served here.
      </p>

      {shown.map((m) => (
        <div key={m.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">
                {m.name}
                {!m.name_revealed && <span className="ml-1.5 text-[11px] font-normal text-slate-400">(not yet served here)</span>}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  {m.code ?? "—"}
                </span>
                {m.conditions.map((c) => (
                  <span key={c} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    {conditionLabel(c)}
                  </span>
                ))}
              </p>
            </div>
            {m.expires_at && (
              <span className="text-[11px] text-slate-400">
                Plan to {new Date(m.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
          </div>

          {visibleRx(m).length === 0 ? (
            <p className="mt-3 text-xs text-slate-400">Nothing scheduled right now.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {visibleRx(m).map((rx) => (
                <li key={rx.id} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-700">
                    {rx.form ? `${rx.form.charAt(0).toUpperCase()}${rx.form.slice(1)} · ` : ""}
                    {rx.medication}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {[rx.dosage, rx.frequency].filter(Boolean).join(" · ") || "No dose recorded"}
                    {rx.duration_days ? ` · ${rx.duration_days} days` : " · ongoing"}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-emerald-700">{dueLine(rx)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}


// ── What the counter records ────────────────────────────────────────────────

type ScheduledMed = {
  id: string;
  medication: string;
  form: string | null;
  dosage: string | null;
  frequency: string | null;
  duration_days: number | null;
  instructions: string | null;
  start_date: string | null;
  end_date: string | null;
  last_fulfilment: { status: string; at: string; here: boolean } | null;
};

type MedOutcome = "collected" | "partial" | "out_of_stock" | "declined";

/** "We didn't have it" is the outcome worth recording, so it is one tap away. */
const MED_OUTCOMES: { value: MedOutcome; label: string }[] = [
  { value: "collected", label: "Collected" },
  { value: "partial", label: "Part of it" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "declined", label: "Didn't take" },
];

const MED_OUTCOME_LABEL: Record<string, string> = Object.fromEntries(
  MED_OUTCOMES.map((o) => [o.value, o.label.toLowerCase()])
);


/**
 * When this member is next expected — the whole point of seeing the schedule
 * ahead of time. A course that ends is a refill due; an open-ended maintenance
 * drug is a monthly repeat.
 */
function dueLine(rx: { start_date: string | null; end_date: string | null; duration_days: number | null }): string {
  const now = new Date();
  const monthDay = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });

  const end = rx.end_date ? new Date(rx.end_date) : null;
  if (end && !Number.isNaN(end.getTime())) {
    const days = Math.round((end.getTime() - now.getTime()) / 86_400_000);
    if (days < 0) return `Refill was due ${monthDay(end)}`;
    if (days === 0) return "Refill due today";
    if (days <= 31) return `Refill due ${monthDay(end)} — about ${days} day${days === 1 ? "" : "s"} away`;
    return `Refill due ${monthDay(end)}`;
  }

  // No end date means an ongoing prescription: they come back about monthly.
  const start = rx.start_date ? new Date(rx.start_date) : null;
  if (start && !Number.isNaN(start.getTime())) {
    const next = new Date(start);
    while (next < now) next.setMonth(next.getMonth() + 1);
    return `Ongoing — next repeat around ${monthDay(next)}`;
  }
  return "Ongoing — no dates set";
}

/**
 * The pharmacy's own QR poster.
 *
 * Someone who scans it starts their care plan with this pharmacy already
 * chosen, which is what turns a walk-in into one of the members above.
 */
function PharmacyQrCard() {
  const [info, setInfo] = useState<{ url: string; code: string; name: string } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pharmacy/qr?format=json", { cache: "no-store" });
        const d = await res.json();
        if (!cancelled && d.success) setInfo(d);
      } catch {
        /* the card just stays closed */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!info) return null;

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-emerald-900">Your sign-up QR code</p>
          <p className="mt-0.5 text-xs text-emerald-800">
            Print it for the counter. Anyone who scans it joins the care plan with{" "}
            {info.name} already set as their pharmacy.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setOpen(true)}
            className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 transition hover:ring-emerald-300"
          >
            Show
          </button>
          <a
            href="/api/pharmacy/qr"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Your sign-up QR code" subtitle={info.name}>
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/pharmacy/qr" alt="Sign-up QR code" className="h-56 w-56 rounded-xl ring-1 ring-slate-100" />
          <p className="break-all text-center text-[11px] text-slate-400">{info.url}</p>
          <a
            href="/api/pharmacy/qr"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700"
          >
            <Download className="h-3.5 w-3.5" /> Download the PNG
          </a>
        </div>
      </Modal>
    </div>
  );
}

