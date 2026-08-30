export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeMemberWhere, appUrl } from "@/lib/consult";
import { itemState } from "@/lib/treatment-plan";
import { pushTo } from "@/lib/push";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * The daily nudge.
 *
 * A treatment plan and a symptom check-in are only worth writing if the member
 * is actually asked. Nothing here runs on its own — call it once a day from a
 * scheduler (Vercel Cron, or anything that can hold a secret):
 *
 *   GET|POST /api/internal/care-reminders?secret=<CARE_REMINDER_SECRET>
 *
 * Vercel Cron issues a GET and sends `Authorization: Bearer $CRON_SECRET`, so
 * both verbs and both ways of carrying the secret are accepted.
 *
 * Two rules keep it from becoming noise:
 *
 *  - **One push per member per day, whatever is outstanding.** Three overdue
 *    checklist items and a check-in are one notification, not four.
 *  - **A member who was nudged inside the window is skipped**, so running the
 *    job twice — a retry, a manual run — does not double-notify anyone.
 */

/** Don't nudge the same member more often than this. */
const QUIET_HOURS = 20;

function authorised(req: NextRequest): boolean {
  // Either secret works: CRON_SECRET is what Vercel Cron sends, and
  // CARE_REMINDER_SECRET lets anything else call it. Unset means off, not open.
  const accepted = [process.env.CARE_REMINDER_SECRET, process.env.CRON_SECRET].filter(
    (v): v is string => !!v
  );
  if (accepted.length === 0) return false;
  const fromQuery = req.nextUrl.searchParams.get("secret");
  const fromHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return accepted.some((v) => v === fromQuery || v === fromHeader);
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const now = new Date();
    const quietSince = new Date(now.getTime() - QUIET_HOURS * 3_600_000);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const members = await prisma.consultPatient.findMany({
      where: {
        ...activeMemberWhere(),
        OR: [{ reminded_at: null }, { reminded_at: { lt: quietSince } }],
      },
      select: {
        id: true,
        email: true,
        full_name: true,
        treatment_plans: {
          where: { status: "active", source: { not: "suggested" } },
          orderBy: { created_at: "desc" },
          take: 1,
          select: {
            items: { where: { remind: true }, select: { cadence: true, last_done_at: true, label: true } },
          },
        },
        screenings: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: { due_on: true },
        },
      },
      take: 500,
    });

    let notified = 0;
    let skipped = 0;

    for (const member of members) {
      const items = member.treatment_plans[0]?.items ?? [];
      const due = items.filter((i) => itemState(i, now).due);
      const lastScreening = member.screenings[0];
      const screeningDue = !lastScreening || new Date(lastScreening.due_on) <= today;

      if (due.length === 0 && !screeningDue) {
        skipped += 1;
        continue;
      }

      const parts: string[] = [];
      if (due.length === 1) parts.push(due[0].label);
      else if (due.length > 1) parts.push(`${due.length} things on your plan`);
      if (screeningDue) parts.push("your symptom check-in");

      const sent = await pushTo("patient", member.email, {
        title: `Hi ${member.full_name.split(" ")[0]} — a couple of minutes?`,
        body: `${parts.join(" and ")} ${parts.length > 1 || due.length > 1 ? "are" : "is"} waiting.`,
        url: `${appUrl()}/dashboard?tab=care`,
        tag: `care-reminder-${member.id}`,
      }).catch(() => 0);

      // Stamped whether or not a push landed: a member with no subscribed
      // device should not be re-examined every run for the rest of the day.
      await prisma.consultPatient.update({
        where: { id: member.id },
        data: { reminded_at: now },
      });

      if (sent > 0) notified += 1;
    }

    return NextResponse.json({
      success: true,
      considered: members.length,
      notified,
      nothing_due: skipped,
    });
  } catch (err) {
    console.error("[internal/care-reminders]", err);
    return NextResponse.json({ error: "Reminder run failed." }, { status: 500 });
  }
}
