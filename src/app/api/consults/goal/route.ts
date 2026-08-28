export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getMemberFromRequest } from "@/lib/consult";

const BodySchema = z.object({
  goal: z.string().trim().min(3, "Tell us your goal for the year").max(500),
  goal_metric: z.string().trim().max(300).optional().nullable(),
});

/** PATCH /api/consults/goal — a member revises their goal for the year. */
export async function PATCH(req: NextRequest) {
  try {
    const member = await getMemberFromRequest(req);
    if (!member) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid goal." }, { status: 400 });
    }

    const updated = await prisma.consultPatient.update({
      where: { id: member.id },
      data: { goal: parsed.data.goal, goal_metric: parsed.data.goal_metric || null },
      select: { goal: true, goal_metric: true },
    });
    return NextResponse.json({ success: true, ...updated });
  } catch (err) {
    console.error("[consults/goal]", err);
    return NextResponse.json({ error: "Could not save your goal." }, { status: 500 });
  }
}
