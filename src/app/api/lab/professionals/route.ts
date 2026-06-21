export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { ensureProfessional } from "@/lib/lims";

/**
 * GET /api/lab/professionals — the unified Referrals list: every professional
 * with their commission totals AND their referral aggregates (how many requests
 * they've sent, when they last referred, and a few recent ones). This folds the
 * old read-only "Referrals" view and the "Professionals" pool into one.
 * Historical referrers are backfilled into the pool, and any professional who is
 * also a registered doctor is synced live from their DoctorProfile.
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_professionals && !auth.permissions.can_view_referrals) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // All referring doctors this lab has ever had — used for both backfill and
  // referral aggregates.
  const refReqs = await prisma.request.findMany({
    where: { lab_id: auth.lab_id, status: { in: ["seen", "done"] } },
    select: { id: true, code: true, doctor_email: true, doctor_name: true, doctor_phone: true, doctor_hospital: true, tests: true, patient_name: true, status: true, created_at: true },
    orderBy: { created_at: "desc" },
  });

  // Backfill: make sure every historical referrer exists as a professional so
  // none were "lost" when Referrals + Professionals merged. Idempotent.
  const existing = await prisma.labProfessional.findMany({ where: { lab_id: auth.lab_id }, select: { email: true, name: true } });
  const haveEmail = new Set(existing.map((p) => (p.email ?? "").toLowerCase()).filter(Boolean));
  const haveName = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  const seenRef = new Set<string>();
  for (const r of refReqs) {
    const email = (r.doctor_email ?? "").toLowerCase();
    const name = (r.doctor_name ?? "").trim();
    if (!email && (!name || name === "Walk-in" || name === "Self Service")) continue;
    const key = email || name.toLowerCase();
    if (seenRef.has(key)) continue;
    seenRef.add(key);
    if ((email && haveEmail.has(email)) || (!email && haveName.has(name.toLowerCase()))) continue;
    await ensureProfessional({ labId: auth.lab_id, name, email: r.doctor_email, phone: r.doctor_phone, hospital: r.doctor_hospital });
  }

  const professionals = await prisma.labProfessional.findMany({
    where: { lab_id: auth.lab_id },
    orderBy: { created_at: "desc" },
  });

  // Sync: overlay live DoctorProfile details (name/contact/bank) for any
  // professional who is also a registered doctor (matched by email).
  const proEmails = professionals.map((p) => p.email?.toLowerCase()).filter(Boolean) as string[];
  const profiles = proEmails.length
    ? await prisma.doctorProfile.findMany({
        where: { email: { in: proEmails } },
        select: { email: true, prefix: true, full_name: true, phone: true, specialty: true, hospitals: true, bank_name: true, bank_code: true, account_number: true, account_name: true },
      })
    : [];
  const profByEmail = new Map(profiles.map((p) => [p.email.toLowerCase(), p]));

  // Accrued vs paid commission totals per professional.
  const grouped = await prisma.professionalCommission.groupBy({
    by: ["professional_id", "status"],
    where: { lab_id: auth.lab_id },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const totals: Record<string, { accrued: number; paid: number; count: number }> = {};
  for (const g of grouped) {
    const t = (totals[g.professional_id] ??= { accrued: 0, paid: 0, count: 0 });
    const amt = Number(g._sum.amount ?? 0);
    if (g.status === "paid") t.paid += amt; else t.accrued += amt;
    t.count += g._count._all;
  }

  // Referral aggregates: every request that carries a referring doctor, matched
  // back to a professional by email (preferred) or name.
  const byEmail = new Map<string, typeof professionals[number]>();
  const byName = new Map<string, typeof professionals[number]>();
  for (const p of professionals) {
    if (p.email) byEmail.set(p.email.toLowerCase(), p);
    byName.set(p.name.trim().toLowerCase(), p);
  }
  type RefAgg = { count: number; last_referral_at: string | null; recent: { code: string; patient_name: string | null; tests: string; status: string; created_at: string }[] };
  const refs: Record<string, RefAgg> = {};
  for (const r of refReqs) {
    const pro = (r.doctor_email && byEmail.get(r.doctor_email.toLowerCase()))
      || (r.doctor_name && byName.get(r.doctor_name.trim().toLowerCase()))
      || null;
    if (!pro) continue;
    const agg = (refs[pro.id] ??= { count: 0, last_referral_at: null, recent: [] });
    agg.count += 1;
    const iso = r.created_at.toISOString();
    if (!agg.last_referral_at || iso > agg.last_referral_at) agg.last_referral_at = iso;
    if (agg.recent.length < 8) agg.recent.push({ code: r.code, patient_name: r.patient_name, tests: r.tests, status: r.status, created_at: iso });
  }

  return NextResponse.json({
    professionals: professionals.map((p) => {
      const prof = p.email ? profByEmail.get(p.email.toLowerCase()) : undefined;
      // Live doctor-dashboard data wins when present (the doctor owns it).
      const synced = !!prof;
      const name = prof?.full_name ? `${prof.prefix ? prof.prefix + " " : ""}${prof.full_name}` : p.name;
      return {
        ...p,
        name,
        phone: prof?.phone ?? p.phone,
        specialty: prof?.specialty ?? p.specialty,
        hospital: prof?.hospitals?.[0] ?? p.hospital,
        bank_name: prof?.bank_name ?? p.bank_name,
        bank_code: prof?.bank_code ?? p.bank_code,
        account_number: prof?.account_number ?? p.account_number,
        account_name: prof?.account_name ?? p.account_name,
        synced_from_doctor: synced,
        commission_value: Number(p.commission_value),
        totals: totals[p.id] ?? { accrued: 0, paid: 0, count: 0 },
        referrals: refs[p.id] ?? { count: 0, last_referral_at: null, recent: [] },
      };
    }),
  });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  specialty: z.string().max(120).optional(),
  hospital: z.string().max(200).optional(),
  commission_type: z.enum(["percent", "flat"]).default("percent"),
  commission_value: z.number().min(0).max(1_000_000).default(0),
  bank_name: z.string().max(120).optional(),
  bank_code: z.string().max(20).optional(),
  account_number: z.string().max(40).optional(),
  account_name: z.string().max(200).optional(),
});

/** POST /api/lab/professionals — add a professional. */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_professionals) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  if (d.commission_type === "percent" && d.commission_value > 100) {
    return NextResponse.json({ error: "Percentage commission cannot exceed 100" }, { status: 400 });
  }
  const email = d.email?.trim() || null;

  if (email) {
    const dup = await prisma.labProfessional.findFirst({ where: { lab_id: auth.lab_id, email } });
    if (dup) return NextResponse.json({ error: "A professional with that email already exists" }, { status: 409 });
  }

  const professional = await prisma.labProfessional.create({
    data: {
      lab_id: auth.lab_id,
      name: d.name,
      email,
      phone: d.phone || null,
      specialty: d.specialty || null,
      hospital: d.hospital || null,
      commission_type: d.commission_type,
      commission_value: d.commission_value,
      bank_name: d.bank_name || null,
      bank_code: d.bank_code || null,
      account_number: d.account_number || null,
      account_name: d.account_name || null,
    },
  });
  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "professional_added", detail: d.name });
  return NextResponse.json({ professional: { ...professional, commission_value: Number(professional.commission_value) } });
}
