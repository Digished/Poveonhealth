export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest, getPatientEmailFromRequest, getPharmacyFromRequest } from "@/lib/consult";
import { pushAvailable } from "@/lib/push";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(300) }),
});

/**
 * Whoever is signed in, in whichever portal.
 *
 * A device is registered against the session that registered it, so a shared
 * phone signed into the patient portal never receives a doctor's alerts.
 */
async function whoIsThis(req: NextRequest): Promise<{ role: "patient" | "doctor" | "pharmacy"; email: string } | null> {
  const doctor = await getDoctorEmailFromConsultRequest(req);
  if (doctor) return { role: "doctor", email: doctor.toLowerCase() };

  const patient = await getPatientEmailFromRequest(req);
  if (patient) return { role: "patient", email: patient.toLowerCase() };

  const pharmacy = await getPharmacyFromRequest(req);
  if (pharmacy) return { role: "pharmacy", email: pharmacy.email.toLowerCase() };

  return null;
}

/** GET — can this browser subscribe, and with which key? */
export async function GET() {
  return NextResponse.json({
    success: true,
    available: pushAvailable(),
    public_key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}

/** POST — register this device for the signed-in account. */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const who = await whoIsThis(req);
    if (!who) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
    const d = parsed.data;

    // The endpoint is the identity of a subscription, so re-registering the
    // same browser updates its owner rather than creating a duplicate — which
    // is what happens when someone signs out and a colleague signs in.
    await prisma.pushSubscription.upsert({
      where: { endpoint: d.endpoint },
      create: {
        endpoint: d.endpoint,
        p256dh: d.keys.p256dh,
        auth: d.keys.auth,
        role: who.role,
        email: who.email,
        user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      },
      update: {
        p256dh: d.keys.p256dh,
        auth: d.keys.auth,
        role: who.role,
        email: who.email,
        failed_at: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[push/subscribe]", err);
    return NextResponse.json({ error: "Could not register this device." }, { status: 500 });
  }
}

/** DELETE — stop notifications on this device. */
export async function DELETE(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const endpoint = req.nextUrl.searchParams.get("endpoint");
    if (!endpoint) return NextResponse.json({ error: "No device given." }, { status: 400 });
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[push/subscribe DELETE]", err);
    return NextResponse.json({ error: "Could not unsubscribe." }, { status: 500 });
  }
}
