export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHospitalFromRequest } from "@/lib/hospital-auth";
import { hashPin } from "@/lib/emr-auth";
import { STAFF_ROLES, ROLE_HOME, type StaffRole } from "@/lib/emr/constants";

function publicStaff(s: {
  id: string; full_name: string; role: string; email: string | null;
  phone: string | null; department_key: string | null; is_active: boolean;
  pin_hash: string | null; created_at: Date;
}) {
  return {
    id: s.id,
    full_name: s.full_name,
    role: s.role,
    email: s.email,
    phone: s.phone,
    department_key: s.department_key,
    is_active: s.is_active,
    has_pin: !!s.pin_hash,
    created_at: s.created_at,
  };
}

/** GET — list all staff for the hospital */
export async function GET(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const staff = await prisma.hospitalStaff.findMany({
      where: { hospital_id: hospital.id },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ success: true, staff: staff.map(publicStaff) });
  } catch (err) {
    console.error("[emr/staff GET]", err);
    return NextResponse.json({ error: "Failed to load staff." }, { status: 500 });
  }
}

/** POST — create a staff member (optionally with an initial PIN) */
export async function POST(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = await req.json();
    const full_name = String(body.full_name ?? "").trim();
    const role = String(body.role ?? "").trim() as StaffRole;
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    const phone = body.phone ? String(body.phone).trim() : null;
    const pin = body.pin ? String(body.pin).trim() : null;

    if (!full_name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (!STAFF_ROLES.includes(role) || role === "super_admin") {
      return NextResponse.json({ error: "Valid staff role is required." }, { status: 400 });
    }
    if (!email && !phone) {
      return NextResponse.json({ error: "Email or phone is required for sign-in." }, { status: 400 });
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    const department_key = ROLE_HOME[role] === "all" ? null : ROLE_HOME[role];

    const staff = await prisma.hospitalStaff.create({
      data: {
        hospital_id: hospital.id,
        full_name,
        role,
        email,
        phone,
        department_key,
        pin_hash: pin ? hashPin(pin) : null,
        created_by: hospital.email ?? "super_admin",
      },
    });

    return NextResponse.json({ success: true, staff: publicStaff(staff) });
  } catch (err) {
    console.error("[emr/staff POST]", err);
    return NextResponse.json({ error: "Failed to add staff member." }, { status: 500 });
  }
}

/** PATCH — update a staff member (details, role, active state, reset PIN) */
export async function PATCH(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Staff id required." }, { status: 400 });

    const existing = await prisma.hospitalStaff.findFirst({ where: { id, hospital_id: hospital.id } });
    if (!existing) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (typeof body.full_name === "string" && body.full_name.trim()) data.full_name = body.full_name.trim();
    if (typeof body.phone === "string") data.phone = body.phone.trim() || null;
    if (typeof body.email === "string") data.email = body.email.trim().toLowerCase() || null;
    if (typeof body.is_active === "boolean") data.is_active = body.is_active;
    if (typeof body.role === "string" && STAFF_ROLES.includes(body.role as StaffRole) && body.role !== "super_admin") {
      data.role = body.role;
      const home = ROLE_HOME[body.role as StaffRole];
      data.department_key = home === "all" ? null : home;
    }
    if (typeof body.department_key === "string") data.department_key = body.department_key || null;
    if (body.pin) {
      const pin = String(body.pin).trim();
      if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
      data.pin_hash = hashPin(pin);
    }

    const staff = await prisma.hospitalStaff.update({ where: { id }, data });
    return NextResponse.json({ success: true, staff: publicStaff(staff) });
  } catch (err) {
    console.error("[emr/staff PATCH]", err);
    return NextResponse.json({ error: "Failed to update staff member." }, { status: 500 });
  }
}

/** DELETE — remove a staff member */
export async function DELETE(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Staff id required." }, { status: 400 });

    const existing = await prisma.hospitalStaff.findFirst({ where: { id, hospital_id: hospital.id } });
    if (!existing) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });

    await prisma.hospitalStaff.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[emr/staff DELETE]", err);
    return NextResponse.json({ error: "Failed to remove staff member." }, { status: 500 });
  }
}
