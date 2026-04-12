import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("scale_token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const session = await prisma.marketerSession.findUnique({
      where: { id: token },
      include: { marketer: true },
    });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const email = req.nextUrl.searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const marketer = session.marketer;

    // Check if doctor profile exists
    const profile = await prisma.doctorProfile.findUnique({
      where: { email },
      select: {
        email: true,
        prefix: true,
        full_name: true,
        phone: true,
        hospitals: true,
        claimed: true,
        created_by_marketer_id: true,
      },
    });

    if (!profile) {
      return NextResponse.json({
        exists: false,
        claimed: false,
        data: null,
      });
    }

    // Check if already linked to this marketer
    const isLinkedToThisMarketer = await prisma.doctorMarketerLink.findFirst({
      where: {
        doctor_email: email,
        marketer_id: marketer.id,
      },
    });

    if (isLinkedToThisMarketer) {
      return NextResponse.json({
        exists: true,
        claimed: profile.claimed,
        alreadyLinked: true,
        data: {
          email: profile.email,
          full_name: profile.full_name,
          prefix: profile.prefix,
          phone: profile.phone,
          hospitals: profile.hospitals,
        },
      });
    }

    // Get labs this marketer is assigned to
    const labMarketerAssignments = await prisma.labMarketer.findMany({
      where: { marketer_id: marketer.id },
      select: { lab_id: true },
    });
    const assignedLabIds = labMarketerAssignments.map((lm) => lm.lab_id);

    // Check if linked to another marketer in same lab
    let assignedToMarketer = null;
    if (assignedLabIds.length > 0) {
      const otherLink = await prisma.doctorMarketerLink.findFirst({
        where: { doctor_email: email },
        include: {
          marketer: { select: { id: true, name: true } },
        },
      });

      if (otherLink) {
        // Check if that marketer is assigned to any of current marketer's labs
        const otherMarketerLabAssignments = await prisma.labMarketer.findFirst({
          where: {
            marketer_id: otherLink.marketer_id,
            lab_id: { in: assignedLabIds },
          },
        });

        if (otherMarketerLabAssignments) {
          assignedToMarketer = otherLink.marketer.name;
        }
      }
    }

    return NextResponse.json({
      exists: true,
      claimed: profile.claimed,
      assignedToMarketer,
      data: {
        email: profile.email,
        full_name: profile.full_name,
        prefix: profile.prefix,
        phone: profile.phone,
        hospitals: profile.hospitals,
      },
    });
  } catch (err) {
    console.error("[scale/professionals/check-email]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
