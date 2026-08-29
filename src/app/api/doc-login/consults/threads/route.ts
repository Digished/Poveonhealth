export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/** A thread drops off the button a day after the doctor has dealt with it. */
const KEEP_HOURS = 24;

/**
 * GET /api/doc-login/consults/threads — the conversations behind the chat
 * button.
 *
 * This is deliberately not "every member": a doctor with hundreds of members
 * wants the handful who are mid-conversation. So the list is anyone with an
 * unanswered message, plus anyone the doctor answered in the last 24 hours —
 * once a reply has settled, the thread leaves the button and lives on in the
 * member's own history.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const since = new Date(Date.now() - KEEP_HOURS * 60 * 60 * 1000);

    const rows = await prisma.$queryRaw<
      {
        id: string;
        full_name: string;
        code: string | null;
        sender: string;
        body: string;
        has_image: boolean;
        created_at: Date;
        unread: bigint;
      }[]
    >`
      SELECT p.id,
             p.full_name,
             p.code,
             m.sender,
             m.body,
             (m.image_url IS NOT NULL) AS has_image,
             m.created_at,
             COALESCE(u.unread, 0) AS unread
      FROM consult_patients p
      JOIN LATERAL (
        SELECT sender, body, image_url, created_at
        FROM consult_messages
        WHERE patient_id = p.id
        ORDER BY created_at DESC
        LIMIT 1
      ) m ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::bigint AS unread
        FROM consult_messages
        WHERE patient_id = p.id AND sender = 'patient' AND read_at IS NULL
      ) u ON true
      WHERE p.doctor_email = ${email}
        AND p.status = 'active'
        AND (COALESCE(u.unread, 0) > 0 OR m.created_at >= ${since})
      ORDER BY (COALESCE(u.unread, 0) > 0) DESC, m.created_at DESC
      LIMIT 50
    `;

    const total = rows.reduce((sum, r) => sum + Number(r.unread), 0);

    return NextResponse.json({
      success: true,
      unread_total: total,
      threads: rows.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        code: r.code,
        unread: Number(r.unread),
        last: {
          sender: r.sender,
          preview: r.has_image && !r.body ? "Photo" : r.body.slice(0, 120),
          has_image: r.has_image,
          created_at: r.created_at,
        },
      })),
    });
  } catch (err) {
    console.error("[doc-login/consults/threads]", err);
    return NextResponse.json({ error: "Could not load your conversations." }, { status: 500 });
  }
}
