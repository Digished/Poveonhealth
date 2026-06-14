export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromRequest } from "@/lib/doctor-encounter";
import { ensureEncounterSchema } from "@/lib/startup/ensure-encounter-schema";
import { ENCOUNTER_THEMES } from "@/lib/encounter-themes";

const THEME_IDS = ENCOUNTER_THEMES.map((t) => t.id) as [string, ...string[]];

const BodySchema = z.object({
  theme: z.enum(THEME_IDS).optional(),
  show_workplace: z.boolean().optional(),
});

/** PATCH /api/doc-login/encounter-page — update the encounter page theme / options. */
export async function PATCH(req: NextRequest) {
  try {
    const email = await getDoctorEmailFromRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const { theme, show_workplace } = parsed.data;
    if (theme === undefined && show_workplace === undefined) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    await ensureEncounterSchema().catch((e) => console.error("[encounter-page] ensure schema:", e));

    const data: Record<string, unknown> = {};
    if (theme !== undefined) data.encounter_theme = theme;
    if (show_workplace !== undefined) data.encounter_show_workplace = show_workplace;

    await prisma.doctorProfile.upsert({
      where: { email },
      create: { email, claimed: true, ...data },
      update: data,
    });

    return NextResponse.json({ success: true, ...parsed.data });
  } catch (err) {
    console.error("[doc-login/encounter-page]", err);
    return NextResponse.json({ error: "Failed to update page." }, { status: 500 });
  }
}
