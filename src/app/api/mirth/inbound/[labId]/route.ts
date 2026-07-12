export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logLabActivity } from "@/lib/lab-activity";
import { parseHl7 } from "@/lib/hl7/parse";

/** Constant-time secret comparison (guards against timing attacks). */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /api/mirth/inbound/[labId]
 * Machine-to-machine webhook: a lab's Mirth channel POSTs analyzer results here
 * as raw HL7 (ORU). Authenticated by the per-lab shared secret in the
 * `x-poveon-secret` header (or `?secret=`). Matched results are written as a
 * DRAFT RequestResult for a technologist to verify — inbound results are never
 * auto-reported.
 */
export async function POST(request: NextRequest, { params }: { params: { labId: string } }) {
  const lab = await prisma.lab.findUnique({
    where: { id: params.labId },
    select: { id: true, mirth_enabled: true, mirth_inbound_secret: true },
  });
  // Do not reveal whether a lab exists — same 401 for missing/disabled/bad secret.
  const provided = request.headers.get("x-poveon-secret") || request.nextUrl.searchParams.get("secret") || "";
  if (!lab || !lab.mirth_enabled || !lab.mirth_inbound_secret || !secretMatches(provided, lab.mirth_inbound_secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = (await request.text().catch(() => "")).trim();
  if (!raw) return NextResponse.json({ error: "Empty body" }, { status: 400 });

  const parsed = parseHl7(raw);

  // Always record the inbound message for audit, even if unparseable/unmatched.
  const baseData = {
    lab_id: lab.id,
    direction: "inbound",
    message_type: parsed?.messageType || "unknown",
    control_id: parsed?.controlId || "unknown",
    payload: raw.slice(0, 100_000),
    attempts: 1,
  };

  if (!parsed) {
    await prisma.hL7Message.create({ data: { ...baseData, status: "error", ack_text: "Unparseable HL7 (no MSH segment)" } });
    return NextResponse.json({ received: true, matched: false, error: "unparseable" }, { status: 200 });
  }

  // Match to a Poveon request by the code carried in PID-3.
  const req = parsed.requestCode
    ? await prisma.request.findFirst({ where: { lab_id: lab.id, code: parsed.requestCode }, select: { id: true } })
    : null;

  if (!req) {
    await prisma.hL7Message.create({
      data: { ...baseData, request_id: null, status: "error", ack_text: `No matching request for code "${parsed.requestCode ?? ""}"` },
    });
    return NextResponse.json({ received: true, matched: false, reason: "no-matching-request" }, { status: 200 });
  }

  const values = parsed.observations.map((o) => ({
    name: o.name || o.code,
    value: o.value,
    unit: o.unit,
    reference_range: o.reference_range,
    flag: o.flag,
  }));

  // Create a DRAFT result for verification (never auto-report inbound data).
  const result = await prisma.requestResult.create({
    data: {
      lab_id: lab.id,
      request_id: req.id,
      kind: "panel",
      status: "draft",
      values,
      comment: parsed.comment ?? null,
    },
  });

  await prisma.hL7Message.create({
    data: { ...baseData, request_id: req.id, result_id: result.id, status: "ack", ack_text: `Draft result created (${values.length} observation${values.length === 1 ? "" : "s"})` },
  });

  logLabActivity({ lab_id: lab.id, actor_email: "mirth", action: "hl7_inbound_result", detail: `Draft result from analyzer for request (${values.length} obs)` });

  return NextResponse.json({ received: true, matched: true, result_id: result.id, observations: values.length }, { status: 200 });
}
