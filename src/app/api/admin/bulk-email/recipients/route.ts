export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const clean = (list: (string | null | undefined)[]) =>
  Array.from(new Set(list.map((e) => e?.trim().toLowerCase()).filter((e): e is string => !!e && e.includes("@"))));

/**
 * GET /api/admin/bulk-email/recipients — recipient lists grouped by category,
 * so the admin can include/omit categories and individual addresses.
 */
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [doctors, pageDoctors, patients, marketers, labs] = await Promise.all([
    prisma.doctorProfile.findMany({ select: { email: true } }).catch(() => []),
    prisma.doctorProfile.findMany({ where: { consultation_fee: { not: null } }, select: { email: true } }).catch(() => []),
    prisma.patientProfile.findMany({ select: { email: true } }).catch(() => []),
    prisma.marketer.findMany({ select: { email: true } }).catch(() => []),
    prisma.lab.findMany({ where: { notification_email: { not: null } }, select: { notification_email: true } }).catch(() => []),
  ]);

  const categories = [
    { key: "doctors", label: "All doctors", emails: clean(doctors.map((d) => d.email)) },
    { key: "doctors_with_pages", label: "Doctors with encounter pages", emails: clean(pageDoctors.map((d) => d.email)) },
    { key: "patients", label: "Patients", emails: clean(patients.map((p) => p.email)) },
    { key: "marketers", label: "Marketers", emails: clean(marketers.map((m) => m.email)) },
    { key: "labs", label: "Labs", emails: clean(labs.map((l) => l.notification_email)) },
  ].map((c) => ({ ...c, count: c.emails.length }));

  return NextResponse.json({ success: true, categories });
}
