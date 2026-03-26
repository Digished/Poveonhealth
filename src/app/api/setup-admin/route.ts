import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

/**
 * ONE-TIME admin setup endpoint for staging.
 * DELETE THIS FILE after creating the admin account.
 *
 * Usage:
 *   POST /api/setup-admin
 *   Body: { "secret": "poveon-setup", "email": "you@example.com", "password": "yourpassword" }
 */
export async function POST(req: NextRequest) {
  const { secret, email, password } = await req.json();

  if (secret !== "poveon-setup") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const supabaseAdmin = createAdminClient();

  // Create the Supabase Auth user with admin role in metadata
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "admin" },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Insert into admin_users table
  await prisma.adminUser.create({
    data: { user_id: data.user.id },
  });

  return NextResponse.json({
    success: true,
    message: `Admin user created: ${email}`,
    user_id: data.user.id,
  });
}
