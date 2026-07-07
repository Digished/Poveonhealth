import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getHmoMemberFromRequest } from "@/lib/hmo/auth";
import { evaluateReading } from "@/lib/hmo/alerts";

export const dynamic = "force-dynamic";

const BpSchema = z.object({
  type: z.literal("bp"),
  systolic: z.coerce.number().int().min(50).max(300),
  diastolic: z.coerce.number().int().min(30).max(200),
  pulse: z.coerce.number().int().min(20).max(250).optional(),
  note: z.string().max(500).optional(),
});

const SugarSchema = z.object({
  type: z.literal("sugar"),
  glucose_mg_dl: z.coerce.number().min(10).max(1000),
  glucose_context: z.enum(["fasting", "random"]),
  note: z.string().max(500).optional(),
});

const BodySchema = z.discriminatedUnion("type", [BpSchema, SugarSchema]);

export async function POST(req: NextRequest) {
  try {
    const auth = await getHmoMemberFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const { member } = auth;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Invalid reading: ${first ? `${first.path.join(".")} ${first.message}` : "check your values"}.` },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const reading = await prisma.hmoVitalsReading.create({
      data:
        data.type === "bp"
          ? {
              member_id: member.id,
              type: "bp",
              systolic: data.systolic,
              diastolic: data.diastolic,
              pulse: data.pulse ?? null,
              note: data.note ?? null,
            }
          : {
              member_id: member.id,
              type: "sugar",
              glucose_mg_dl: data.glucose_mg_dl,
              glucose_context: data.glucose_context,
              note: data.note ?? null,
            },
    });

    // Never fails the save — evaluateReading catches its own errors.
    const alerts = await evaluateReading(reading, member);

    return NextResponse.json({
      success: true,
      reading,
      alerts: alerts.map((a) => ({ type: a.type, severity: a.severity, message: a.message })),
    });
  } catch (err) {
    console.error("[hmo/vitals POST]", err);
    return NextResponse.json({ error: "Failed to save reading. Please try again." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getHmoMemberFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const { member } = auth;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // "bp" | "sugar" | null (all)
    const limit = Math.min(Number(searchParams.get("limit")) || 60, 200);
    const cursor = searchParams.get("cursor");

    const readings = await prisma.hmoVitalsReading.findMany({
      where: {
        member_id: member.id,
        ...(type === "bp" || type === "sugar" ? { type } : {}),
      },
      orderBy: { recorded_at: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = readings.length > limit;
    const page = hasMore ? readings.slice(0, limit) : readings;

    return NextResponse.json({
      success: true,
      readings: page,
      next_cursor: hasMore ? page[page.length - 1]?.id : null,
    });
  } catch (err) {
    console.error("[hmo/vitals GET]", err);
    return NextResponse.json({ error: "Failed to load readings." }, { status: 500 });
  }
}
