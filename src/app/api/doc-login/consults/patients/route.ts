export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { RISK_ORDER, type RiskLevel } from "@/lib/care-risk";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const PAGE_SIZE = 25;

type LastMessage = { patient_id: string; sender: string; body: string; created_at: Date };

/**
 * GET /api/doc-login/consults/patients — one page of the doctor's pool.
 *
 * A doctor may be carrying a couple of thousand members, so everything that
 * narrows the list (search, filter, paging) happens in the database, and the
 * per-row summary is assembled with two grouped queries over the page only.
 *
 * Query params: `q`, `filter` (all|needs_reply|new|inactive), `page`.
 */
export async function GET(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const params = req.nextUrl.searchParams;
    const q = (params.get("q") ?? "").trim();
    const filter = params.get("filter") ?? "all";
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

    const now = new Date();
    const where: Prisma.ConsultPatientWhereInput = { doctor_email: email };
    // A plan that has run out is lapsed whether or not its flag has been
    // flipped yet, so the expiry is part of the filter, not just the status.
    if (filter === "inactive") {
      where.OR = [{ status: { not: "active" } }, { expires_at: { lte: now } }];
    } else {
      where.status = "active";
      where.expires_at = { gt: now };
    }

    if (filter === "needs_reply") {
      where.messages = { some: { sender: "patient", read_at: null } };
    } else if (filter === "new") {
      // Nobody has written to them yet — these are the first assessments due.
      where.messages = { none: { sender: "doctor" } };
    }

    if (q) {
      where.AND = [
        {
          OR: [
            { full_name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        },
      ];
    }

    const [total, patients] = await Promise.all([
      prisma.consultPatient.count({ where }),
      prisma.consultPatient.findMany({
        where,
        orderBy: { assigned_at: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, code: true, full_name: true, email: true, phone: true,
          conditions: true, status: true, assigned_at: true,
          expires_at: true, messages_used: true, message_allowance: true,
          risk_level: true, risk_reason: true,
        },
      }),
    ]);

    const ids = patients.map((p) => p.id);
    const lastBy = new Map<string, LastMessage>();
    const unreadBy = new Map<string, number>();
    const assessed = new Set<string>();

    if (ids.length) {
      const [lastMessages, unreadCounts, assessedRows] = await Promise.all([
        // Newest message per member, straight off the (patient_id, created_at) index.
        prisma.$queryRaw<LastMessage[]>`
          SELECT DISTINCT ON (patient_id) patient_id, sender, body, created_at
          FROM consult_messages
          WHERE patient_id = ANY(${ids}::text[])
          ORDER BY patient_id, created_at DESC
        `,
        prisma.consultMessage.groupBy({
          by: ["patient_id"],
          where: { patient_id: { in: ids }, sender: "patient", read_at: null },
          _count: { id: true },
        }),
        // Members the doctor has already written to at least once.
        prisma.consultMessage.groupBy({
          by: ["patient_id"],
          where: { patient_id: { in: ids }, sender: "doctor" },
          _count: { id: true },
        }),
      ]);
      for (const m of lastMessages) lastBy.set(m.patient_id, m);
      for (const u of unreadCounts) unreadBy.set(u.patient_id, u._count.id);
      for (const a of assessedRows) assessed.add(a.patient_id);
    }

    return NextResponse.json({
      success: true,
      total,
      page,
      page_size: PAGE_SIZE,
      has_more: page * PAGE_SIZE < total,
      patients: patients
        .map((p) => {
          const last = lastBy.get(p.id);
          return {
            ...p,
            messages_left: Math.max(0, p.message_allowance - p.messages_used),
            unread: unreadBy.get(p.id) ?? 0,
            last_message: last
              ? { sender: last.sender, preview: last.body.slice(0, 160), created_at: last.created_at }
              : null,
            assessed: assessed.has(p.id),
          };
        })
        // Anyone whose last reading needs attention comes first — being buried
        // under whoever joined most recently is exactly the wrong outcome.
        // Sorted here rather than in SQL because the column is a string, so
        // ORDER BY would sort it alphabetically: "none" ahead of "watch".
        .sort((a, b) => {
          const rank =
            (RISK_ORDER[(b.risk_level ?? "none") as RiskLevel] ?? 0) -
            (RISK_ORDER[(a.risk_level ?? "none") as RiskLevel] ?? 0);
          if (rank !== 0) return rank;
          if (a.unread !== b.unread) return b.unread - a.unread;
          return 0;
        }),
    });
  } catch (err) {
    console.error("[doc-login/consults/patients]", err);
    return NextResponse.json({ error: "Could not load your members." }, { status: 500 });
  }
}
