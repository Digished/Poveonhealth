export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/referral-tracking
 *
 * Doctor-referral tracking aggregated across **every** request, not just the
 * latest page. The dashboard previously grouped referrers from the first 50
 * requests only, so referral counts were wrong for anyone whose orders had
 * scrolled off that page. This groups the full request history server-side and
 * returns the same shape the Referrals tab and detail modal already consume.
 */
export async function GET(_request: NextRequest) {
  try {
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
    if (!adminRecord) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    // Slim projection over the whole request history — only what the referral
    // list, detail modal and per-test breakdown actually read.
    const requests = await prisma.request.findMany({
      select: {
        id: true, code: true, patient_name: true, tests: true, status: true,
        created_at: true, fast_mode: true,
        doctor_prefix: true, doctor_name: true, doctor_email: true, doctor_hospital: true,
      },
      orderBy: { created_at: "desc" },
    });

    // Which referring doctors have a DoctorProfile on file (→ "Registered").
    const doctorEmails = Array.from(
      new Set(requests.map((r) => r.doctor_email?.trim().toLowerCase()).filter((e): e is string => !!e)),
    );
    const profiles = doctorEmails.length
      ? await prisma.doctorProfile.findMany({ where: { email: { in: doctorEmails } }, select: { email: true } })
      : [];
    const registeredEmails = new Set(profiles.map((p) => p.email.toLowerCase()));

    const now = new Date();
    type Group = {
      key: string;
      email: string;
      referrerName: string;
      hospital: string | null;
      requests: typeof requests;
      thisMonthCount: number;
      registered: boolean;
      fastCount: number;
    };
    const map = new Map<string, Group>();

    for (const req of requests) {
      const email = req.doctor_email?.trim().toLowerCase() || "";
      const key = email || `nomail:${[req.doctor_prefix, req.doctor_name].filter(Boolean).join(" ")}`;
      const d = new Date(req.created_at);
      const isThisMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();

      const existing = map.get(key);
      if (existing) {
        existing.requests.push(req);
        if (isThisMonth) existing.thisMonthCount++;
        if (req.fast_mode) existing.fastCount++;
        if (!existing.referrerName && req.doctor_name) existing.referrerName = [req.doctor_prefix, req.doctor_name].filter(Boolean).join(" ");
        if (!existing.hospital && req.doctor_hospital) existing.hospital = req.doctor_hospital;
      } else {
        map.set(key, {
          key,
          email: req.doctor_email ?? "",
          referrerName: [req.doctor_prefix, req.doctor_name].filter(Boolean).join(" "),
          hospital: req.doctor_hospital ?? null,
          requests: [req],
          thisMonthCount: isThisMonth ? 1 : 0,
          registered: email ? registeredEmails.has(email) : false,
          fastCount: req.fast_mode ? 1 : 0,
        });
      }
    }

    const groups = Array.from(map.values()).sort((a, b) => b.requests.length - a.requests.length);

    return NextResponse.json({ success: true, groups });
  } catch (error) {
    console.error("Referral tracking error:", error);
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 });
  }
}
