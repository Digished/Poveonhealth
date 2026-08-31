"use client";

/**
 * What the member's medication costs, and how they pay for it.
 *
 * Until now a member could see what their doctor had prescribed and had no way
 * to learn what any of it cost — they found out at the counter, which is the
 * one place a discount programme cannot prove itself. This is the answer: every
 * live prescription priced against their own pharmacy, the saving stated in
 * naira beside every line and again on the total, and a button that pays for it.
 *
 * Three things it refuses to be vague about:
 *
 *  - **The saving is shown in naira, not just as a percent.** "10% off" is a
 *    claim; "you save ₦200" is a fact someone can check against the shelf.
 *  - **A medication the pharmacy has not priced is still listed**, marked as
 *    such. Dropping it would read as though the doctor had stopped it.
 *  - **Paying ahead is a first-class choice.** A refill bought this month for
 *    next month is the behaviour the programme wants, so it is a labelled
 *    option rather than something to work out.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import {
  AlertCircle, ArrowRight, CalendarClock, Check, Loader2, PackageCheck,
  Pill, ShoppingBag, Store, TicketPercent,
} from "lucide-react";

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

type Med = {
  id: string;
  medication: string;
  form: string | null;
  dosage: string | null;
  frequency: string | null;
  status: string;
  priced: boolean;
  medication_id?: string;
  pack?: string | null;
  in_stock?: boolean;
  list_price?: number;
  you_pay?: number;
  you_save?: number;
  saving_percent?: number;
};

type Order = {
  id: string;
  for_month: string;
  status: string;
  total_naira: number;
  saving_naira: number;
  paid_at: string | null;
  ready_at: string | null;
  collected_at: string | null;
  pharmacy_name: string;
  items: { name: string; strength: string | null; quantity: number; member_naira: number }[];
};

type Payload = {
  pharmacy: { id: string; name: string; address: string | null; city: string | null } | null;
  medications: Med[];
  total: {
    items: number; you_pay: number; you_save: number; list: number;
    unpriced: number; out_of_stock: number;
  };
  orders: Order[];
};

const MONTH = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export function MedicationPay({ onPickPharmacy }: { onPickPharmacy?: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [forMonth, setForMonth] = useState<"this" | "next">("this");
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/consults/medications");
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) return;
      setData(d);
      // Everything buyable starts ticked: the common case is "all of it".
      const start: Record<string, boolean> = {};
      for (const m of d.medications as Med[]) {
        if (m.priced && m.in_stock) start[m.medication_id!] = true;
      }
      setChosen(start);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => {
    if (!data) return { items: [] as Med[], pay: 0, save: 0 };
    const items = data.medications.filter((m) => m.priced && m.in_stock && chosen[m.medication_id!]);
    return {
      items,
      pay: items.reduce((s, m) => s + (m.you_pay ?? 0), 0),
      save: items.reduce((s, m) => s + (m.you_save ?? 0), 0),
    };
  }, [data, chosen]);

  async function pay() {
    if (paying || selected.items.length === 0) return;
    setPaying(true);
    try {
      const res = await fetch("/api/consults/medications/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selected.items.map((m) => ({ medication_id: m.medication_id, quantity: 1 })),
          for_month: forMonth,
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.authorization_url) {
        toast.error(d?.error ?? "We could not start that payment.");
        setPaying(false);
        return;
      }
      window.location.href = d.authorization_url;
    } catch {
      toast.error("Network error. Please try again.");
      setPaying(false);
    }
  }

  if (loading) {
    return <div className="h-56 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />;
  }
  if (!data) {
    return (
      <p className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-500">
        We could not load your medication just now.
      </p>
    );
  }

  // No pharmacy chosen: nothing can be priced, so say that rather than showing
  // an empty list that looks like "you have no medication".
  if (!data.pharmacy) {
    return (
      <section className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
        <Store className="mx-auto h-7 w-7 text-slate-300" />
        <h3 className="mt-3 text-sm font-bold text-slate-800">Choose a pharmacy to see prices</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
          Prices come from the pharmacy you pick, so we need to know where you collect before we can
          tell you what your medication costs.
        </p>
        {onPickPharmacy && (
          <button
            onClick={onPickPharmacy}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-medical-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-medical-700"
          >
            Pick a pharmacy <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </section>
    );
  }

  const live = data.orders.filter((o) => o.status === "paid" || o.status === "ready");

  return (
    <div className="space-y-4">
      {/* Anything already paid for and waiting. */}
      {live.map((o) => (
        <div key={o.id} className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
          <div className="flex items-start gap-3">
            <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-emerald-900">
                {o.status === "ready" ? "Ready to collect" : "Paid — being made up"}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-emerald-800">
                {o.items.length} item{o.items.length === 1 ? "" : "s"} at {o.pharmacy_name} for{" "}
                {MONTH(o.for_month)}. You paid {naira(o.total_naira)} and saved{" "}
                {naira(o.saving_naira)}.
              </p>
            </div>
          </div>
        </div>
      ))}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <Pill className="h-4 w-4 text-medical-500" />
              Your medication
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Priced at {data.pharmacy.name}
              {data.pharmacy.city ? `, ${data.pharmacy.city}` : ""}
            </p>
          </div>
          {onPickPharmacy && (
            <button onClick={onPickPharmacy} className="shrink-0 text-xs font-semibold text-medical-600 hover:underline">
              Change pharmacy
            </button>
          )}
        </div>

        {data.medications.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            Nothing on your list yet. Your doctor&apos;s prescriptions appear here with prices.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.medications.map((m) => (
              <li key={m.id} className="p-4">
                {m.priced && m.in_stock ? (
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={!!chosen[m.medication_id!]}
                      onChange={(e) =>
                        setChosen((c) => ({ ...c, [m.medication_id!]: e.target.checked }))
                      }
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-medical-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <span className="text-sm font-semibold text-slate-800">{m.medication}</span>
                        <span className="text-sm font-bold text-slate-900">{naira(m.you_pay!)}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-xs text-slate-500">
                          {[m.dosage, m.frequency, m.pack].filter(Boolean).join(" · ") || "As directed"}
                        </span>
                        {(m.you_save ?? 0) > 0 ? (
                          <span className="text-xs font-semibold text-emerald-600">
                            You save {naira(m.you_save!)}
                            <span className="ml-1 font-normal text-slate-400 line-through">
                              {naira(m.list_price!)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Shop price</span>
                        )}
                      </span>
                    </span>
                  </label>
                ) : (
                  <div className="flex items-start gap-3 opacity-70">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700">{m.medication}</p>
                      <p className="text-xs text-slate-500">
                        {m.priced
                          ? `Out of stock at ${data.pharmacy!.name} right now — ask them, or change pharmacy.`
                          : `${data.pharmacy!.name} has not listed a price for this. You can still collect it and pay them directly.`}
                      </p>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The basket. */}
      {selected.items.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-medical-100 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-medical-600 to-medical-800 px-4 py-4 text-white">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
                  {selected.items.length} item{selected.items.length === 1 ? "" : "s"}
                </p>
                <p className="mt-0.5 text-2xl font-black leading-none">{naira(selected.pay)}</p>
              </div>
              {selected.save > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">
                  <TicketPercent className="h-3.5 w-3.5" />
                  Saving {naira(selected.save)}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                When is this for?
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <MonthChoice
                  active={forMonth === "this"}
                  onClick={() => setForMonth("this")}
                  icon={<ShoppingBag className="h-4 w-4" />}
                  title="Collect now"
                  note="Ready when you arrive"
                />
                <MonthChoice
                  active={forMonth === "next"}
                  onClick={() => setForMonth("next")}
                  icon={<CalendarClock className="h-4 w-4" />}
                  title="Next month"
                  note="Reserved for your refill"
                />
              </div>
            </div>

            <button
              onClick={pay}
              disabled={paying}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-medical-600/20 transition hover:bg-medical-700 disabled:opacity-60"
            >
              {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {paying ? "Opening checkout…" : `Pay ${naira(selected.pay)}`}
            </button>

            <p className="text-center text-[11px] leading-relaxed text-slate-400">
              {data.pharmacy.name} is paid straight away and will have it ready.
              {selected.save > 0 && ` You are ${naira(selected.save)} better off than the shop price.`}
            </p>
          </div>
        </section>
      )}

      {(data.total.unpriced > 0 || data.total.out_of_stock > 0) && (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          {data.total.unpriced > 0 && (
            <>
              {data.total.unpriced} medication{data.total.unpriced === 1 ? "" : "s"} on your list
              {data.total.unpriced === 1 ? " is" : " are"} not priced by {data.pharmacy.name}.{" "}
            </>
          )}
          {data.total.out_of_stock > 0 && (
            <>
              {data.total.out_of_stock} {data.total.out_of_stock === 1 ? "is" : "are"} out of stock
              there.{" "}
            </>
          )}
          Another partner pharmacy may have them — changing pharmacy re-prices everything.
        </p>
      )}
    </div>
  );
}

function MonthChoice({
  active, onClick, icon, title, note,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; note: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 p-3 text-left transition ${
        active ? "border-medical-500 bg-medical-50" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <span className={active ? "text-medical-600" : "text-slate-400"}>{icon}</span>
      <span className="mt-1.5 block text-[13px] font-bold text-slate-800">{title}</span>
      <span className="block text-[11px] leading-tight text-slate-500">{note}</span>
    </button>
  );
}
