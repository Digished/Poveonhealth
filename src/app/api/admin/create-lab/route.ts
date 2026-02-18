import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { derivePrefixFromName } from "@/lib/code-generator";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { labAccountCreated } from "@/lib/email/templates";

const CreateLabSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
  addresses: z.array(z.string().min(5)).min(1).max(10),
  tempPassword: z
    .string()
    .min(8)
    .max(100)
    .optional(),
});

function generateTempPassword(): string {
  const chars =
    "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate and verify admin role
    const authClient = await createServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const adminClient = createAdminClient();

    const { data: adminUser } = await adminClient
      .from("admin_users")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!adminUser) {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = CreateLabSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { name, email, addresses } = parsed.data;
    const tempPassword = parsed.data.tempPassword ?? generateTempPassword();

    // Derive a unique prefix from the lab name
    let prefix = derivePrefixFromName(name);

    // Check prefix collision and append number if needed
    let attempt = 0;
    while (true) {
      const candidatePrefix = attempt === 0 ? prefix : `${prefix}${attempt}`;
      const { data: existing } = await adminClient
        .from("labs")
        .select("id")
        .eq("prefix", candidatePrefix)
        .maybeSingle();

      if (!existing) {
        prefix = candidatePrefix;
        break;
      }
      attempt++;
      if (attempt > 9) {
        return NextResponse.json(
          {
            success: false,
            error: "Could not generate a unique prefix for this lab name",
          },
          { status: 500 }
        );
      }
    }

    // Create the lab record
    const { data: newLab, error: labError } = await adminClient
      .from("labs")
      .insert({ name, prefix, addresses, email })
      .select()
      .single();

    if (labError || !newLab) {
      console.error("Lab creation error:", labError);
      if (labError?.code === "23505") {
        return NextResponse.json(
          { success: false, error: "A lab with that email already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Failed to create lab" },
        { status: 500 }
      );
    }

    // Create Supabase Auth user for this lab
    const { data: authData, error: authError } =
      await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          role: "lab",
          lab_id: newLab.id,
          lab_name: name,
        },
      });

    if (authError || !authData.user) {
      // Rollback lab creation
      await adminClient.from("labs").delete().eq("id", newLab.id);
      console.error("Auth user creation error:", authError);
      return NextResponse.json(
        { success: false, error: "Failed to create lab user account" },
        { status: 500 }
      );
    }

    // Link auth user to lab
    const { error: linkError } = await adminClient.from("lab_users").insert({
      user_id: authData.user.id,
      lab_id: newLab.id,
    });

    if (linkError) {
      console.error("Lab user link error:", linkError);
      // Rollback
      await adminClient.auth.admin.deleteUser(authData.user.id);
      await adminClient.from("labs").delete().eq("id", newLab.id);
      return NextResponse.json(
        { success: false, error: "Failed to link lab account" },
        { status: 500 }
      );
    }

    // Send credentials email to lab
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://poveon.netlify.app"}/lab-login`;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: `Welcome to Poveon Health — Lab Account Created`,
      html: labAccountCreated({ labName: name, email, tempPassword, loginUrl }),
    });

    return NextResponse.json({
      success: true,
      lab: {
        id: newLab.id,
        name: newLab.name,
        prefix: newLab.prefix,
        email: newLab.email,
      },
      tempPassword,
    });
  } catch (error) {
    console.error("Create lab error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
