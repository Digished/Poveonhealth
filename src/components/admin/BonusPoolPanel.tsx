"use client";

/**
 * One month's doctor bonus pool, and who it goes to.
 *
 * The form is a ranked horizontal bar, one bar per doctor, length carrying the
 * share. That is the "compare magnitude" job, and its colour job is a single
 * hue: the doctors are not distinct series whose identity needs colour-coding,
 * they are one quantity ranked, so shading them by rank would double-encode
 * what the length already says. `#3987e5` on the dark surface and `#2a78d6` on
 * the light one, both checked against the real surfaces rather than eyeballed.
 *
 * Horizontal rather than vertical because the labels are people's names, and
 * because the list can be long. Every bar is direct-labelled with its
 * percentage and amount — a share display where you have to hover to learn what
 * someone was paid is not a share display.
 *
 * The revenue behind the pool is broken into its three parts, because a total
 * nobody can explain is a total nobody trusts.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import {
  Calculator, CheckCircle2, Info, Loader2, MessageSquareText, RotateCcw,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/Overlay";

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/**
 * Shares are stored to three decimals so a month reconciles exactly, but nobody
 * reads "41.955%". Shown to one, and to two only when a share is small enough
 * that one decimal would round it to zero.
 */
const pct = (n: number) => `${n < 0.1 && n > 0 ? n.toFixed(2) : n.toFixed(1)}%`;

type Share = {
  doctorEmail: string;
  doctorName: string | null;
  patients: number;
  messages: number;
  weight: number;
  sharePercent: number;
  amountNaira: number;
};

type Pool = {
  period: string;
  revenueNaira: number;
  revenueMedication: number;
  revenueOnboarding: number;
  revenueTopups: number;
  poolPercent: number;
  poolNaira: number;
  totalWeight: number;
  shares: Share[];
  status: "draft" | "paid";
  computedAt: string | null;
  paidAt: string | null;
};

type PeriodRow = { period: string; status: string | null; pool_naira: number | null };

function monthLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function BonusPoolPanel() {
  const [period, setPeriod] = useState<string>("");
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [pool, setPool] = useState<Pool | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"compute" | "pay" | "reopen" | null>(null);
  const [confirmPay, setConfirmPay] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const load = useCallback(async (want?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/consults/bonus-pool${want ? `?period=${want}` : ""}`);
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) return;
      setPool(d.pool);
      setSaved(d.saved);
      setPeriods(d.periods ?? []);
      setPeriod(d.pool.period);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(action: "compute" | "mark_paid" | "reopen") {
    setBusy(action === "mark_paid" ? "pay" : action === "reopen" ? "reopen" : "compute");
    try {
      const res = await fetch("/api/admin/consults/bonus-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, action }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "That did not work."); return; }
      setPool(d.pool);
      setSaved(true);
      toast.success(
        action === "compute" ? "Worked out and saved"
        : action === "mark_paid" ? "Marked paid"
        : "Reopened"
      );
      void load(period);
    } finally {
      setBusy(null);
    }
  }

  if (loading && !pool) {
    return <div className="h-64 animate-pulse rounded-2xl" style={{ background: "var(--dash-surface-2)" }} />;
  }
  if (!pool) {
    return <p className="dash-muted py-10 text-center text-sm">Could not load the bonus pool.</p>;
  }

  const paid = pool.status === "paid";
  const top = pool.shares[0]?.sharePercent ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold" style={{ color: "var(--dash-text)" }}>
            Doctor bonus pool
          </h3>
          <p className="dash-muted mt-0.5 max-w-2xl text-xs leading-relaxed">
            {pool.poolPercent}% of the month&apos;s revenue, split by how much of the messaging each
            doctor carried. A member who writes often is a member who needs more — this pays the
            doctor holding them. It is counted on messages the members sent, not on the doctor&apos;s
            replies, which a doctor could pad.
          </p>
        </div>

        <select
          value={period}
          onChange={(e) => load(e.target.value)}
          className="dash-ring shrink-0 rounded-lg px-3 py-2 text-xs font-semibold outline-none"
          style={{
            background: "var(--dash-surface-2)",
            border: "1px solid var(--dash-border)",
            color: "var(--dash-text)",
          }}
        >
          {periods.map((p) => (
            <option key={p.period} value={p.period}>
              {monthLabel(p.period)}
              {p.status === "paid" ? " · paid" : p.status ? " · draft" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* The pool itself, and where the money behind it came from. */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--dash-surface)", border: "1px solid var(--dash-border)" }}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dash-faint text-[11px] font-bold uppercase tracking-[0.13em]">
              Pool for {monthLabel(pool.period)}
            </p>
            <p
              className="mt-1 text-[40px] font-black leading-none"
              style={{ color: "var(--dash-text)" }}
            >
              {naira(pool.poolNaira)}
            </p>
            <p className="dash-muted mt-1.5 text-xs">
              {pool.poolPercent}% of {naira(pool.revenueNaira)} revenue
            </p>
          </div>

          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={
              paid
                ? { background: "rgba(16,163,110,0.15)", color: "#10a36e" }
                : { background: "var(--dash-surface-3)", color: "var(--dash-muted)" }
            }
          >
            {paid ? `Paid${pool.paidAt ? ` ${new Date(pool.paidAt).toLocaleDateString("en-GB")}` : ""}` : saved ? "Draft" : "Not worked out yet"}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <RevenuePart label="Medication margin" value={pool.revenueMedication} total={pool.revenueNaira} />
          <RevenuePart label="Onboarding fees" value={pool.revenueOnboarding} total={pool.revenueNaira} />
          <RevenuePart label="Message top-ups" value={pool.revenueTopups} total={pool.revenueNaira} />
        </div>
      </div>

      {/* The distribution. */}
      {pool.shares.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: "var(--dash-surface)", border: "1px solid var(--dash-border)" }}
        >
          <MessageSquareText className="mx-auto h-6 w-6" style={{ color: "var(--dash-faint)" }} />
          <p className="mt-2 text-sm font-semibold" style={{ color: "var(--dash-text)" }}>
            No members wrote in {monthLabel(pool.period)}
          </p>
          <p className="dash-muted mx-auto mt-1 max-w-sm text-xs leading-relaxed">
            With nothing to weight by, there is nothing to split. The pool is not distributed for
            this month.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl p-4 sm:p-5"
          style={{ background: "var(--dash-surface)", border: "1px solid var(--dash-border)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold" style={{ color: "var(--dash-text)" }}>
                Share per doctor
              </h4>
              <p className="dash-muted mt-0.5 text-[11px]">
                {pool.shares.length} doctor{pool.shares.length === 1 ? "" : "s"} ·{" "}
                {pool.totalWeight.toLocaleString()} member message
                {pool.totalWeight === 1 ? "" : "s"} in the month
              </p>
            </div>
            <button
              onClick={() => setShowTable((v) => !v)}
              className="dash-ring rounded-lg px-2.5 py-1.5 text-[11px] font-semibold"
              style={{ background: "var(--dash-surface-2)", color: "var(--dash-muted)" }}
            >
              {showTable ? "Show chart" : "Show table"}
            </button>
          </div>

          {showTable ? (
            <ShareTable shares={pool.shares} />
          ) : (
            <ul className="mt-4 space-y-3.5">
              {pool.shares.map((s) => (
                <ShareBar key={s.doctorEmail} share={s} widest={top} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!paid && (
          <button
            onClick={() => act("compute")}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-medical-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-medical-700 disabled:opacity-60"
          >
            {busy === "compute" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            {saved ? "Work it out again" : "Work out this month"}
          </button>
        )}
        {saved && !paid && pool.shares.length > 0 && (
          <button
            onClick={() => setConfirmPay(true)}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy === "pay" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Mark paid
          </button>
        )}
        {paid && (
          <button
            onClick={() => act("reopen")}
            disabled={busy !== null}
            className="dash-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ background: "var(--dash-surface-2)", color: "var(--dash-muted)" }}
          >
            {busy === "reopen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Reopen
          </button>
        )}
      </div>

      {paid && (
        <p
          className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-[11px] leading-relaxed"
          style={{ background: "var(--dash-surface-2)", color: "var(--dash-muted)" }}
        >
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          A paid month is frozen — the figures stay as they were even if the pool percentage
          changes later. Reopen it only to correct a mistake.
        </p>
      )}

      <ConfirmDialog
        open={confirmPay}
        onClose={() => setConfirmPay(false)}
        onConfirm={() => { setConfirmPay(false); void act("mark_paid"); }}
        title={`Mark ${monthLabel(pool.period)} paid?`}
        body={`${naira(pool.poolNaira)} across ${pool.shares.length} doctor${pool.shares.length === 1 ? "" : "s"}. The figures freeze at this point and stop responding to later changes.`}
        confirmLabel="Mark paid"
        tone="primary"
      />
    </div>
  );
}

/**
 * One doctor's bar.
 *
 * Scaled against the largest share rather than 100%, so a month where the top
 * doctor holds 30% still fills the row and the differences stay readable.
 * Bar capped at 10px with the band's leftover left as air, 4px rounded at the
 * data end and square at the baseline.
 */
function ShareBar({ share, widest }: { share: Share; widest: number }) {
  const width = widest > 0 ? Math.max(2, (share.sharePercent / widest) * 100) : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] font-semibold" style={{ color: "var(--dash-text)" }}>
          {share.doctorName ?? share.doctorEmail}
        </p>
        <p className="shrink-0 text-[13px] font-bold tabular-nums" style={{ color: "var(--dash-text)" }}>
          {naira(share.amountNaira)}
          <span className="dash-muted ml-1.5 text-[11px] font-semibold">{pct(share.sharePercent)}</span>
        </p>
      </div>

      <div
        className="mt-1.5 h-2.5 w-full overflow-hidden rounded-l-none rounded-r-[4px]"
        style={{ background: "var(--dash-surface-3)" }}
      >
        <div
          className="h-full rounded-l-none rounded-r-[4px] transition-[width] duration-500 ease-out"
          style={{ width: `${width}%`, background: "var(--bonus-bar)" }}
        />
      </div>

      <p className="dash-faint mt-1 text-[11px]">
        {share.messages.toLocaleString()} message{share.messages === 1 ? "" : "s"} from{" "}
        {share.patients} member{share.patients === 1 ? "" : "s"}
      </p>
    </li>
  );
}

/** The same figures as rows — required so identity is never colour-alone. */
function ShareTable({ shares }: { shares: Share[] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm table-cards">
        <thead>
          <tr className="dash-faint text-left text-[11px]" style={{ borderBottom: "1px solid var(--dash-border)" }}>
            <th className="px-2 py-2 font-semibold">Doctor</th>
            <th className="px-2 py-2 font-semibold">Members</th>
            <th className="px-2 py-2 font-semibold">Messages</th>
            <th className="px-2 py-2 font-semibold">Share</th>
            <th className="px-2 py-2 font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {shares.map((s) => (
            <tr key={s.doctorEmail} style={{ borderTop: "1px solid var(--dash-border)" }}>
              <td className="px-2 py-2.5" data-label="Doctor">
                <p className="font-semibold" style={{ color: "var(--dash-text)" }}>
                  {s.doctorName ?? s.doctorEmail}
                </p>
                {s.doctorName && <p className="dash-faint text-[11px]">{s.doctorEmail}</p>}
              </td>
              <td className="dash-muted px-2 py-2.5 text-xs tabular-nums" data-label="Members">{s.patients}</td>
              <td className="dash-muted px-2 py-2.5 text-xs tabular-nums" data-label="Messages">{s.messages.toLocaleString()}</td>
              <td className="px-2 py-2.5 text-xs font-semibold tabular-nums" style={{ color: "var(--dash-text)" }} data-label="Share">{pct(s.sharePercent)}</td>
              <td className="px-2 py-2.5 text-xs font-bold tabular-nums" style={{ color: "var(--dash-text)" }} data-label="Amount">{naira(s.amountNaira)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevenuePart({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className="rounded-xl px-3.5 py-3"
      style={{ background: "var(--dash-surface-2)", border: "1px solid var(--dash-border)" }}
    >
      <p className="dash-faint text-[11px] font-semibold">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums" style={{ color: "var(--dash-text)" }}>
        {naira(value)}
      </p>
      <p className="dash-muted text-[11px] tabular-nums">{pct}% of revenue</p>
    </div>
  );
}
