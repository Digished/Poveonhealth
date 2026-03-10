import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { LabDashboard } from "@/components/LabDashboard";

export const metadata = {
  title: "Lab Dashboard — Poveon",
};

export default async function LabDashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const role = user?.user_metadata?.role;
  if (!user || (role !== "lab" && role !== "lab_member")) {
    redirect("/lab-login");
  }

  // Look up the lab based on role type
  let labId: string | null = null;

  if (role === "lab") {
    const labUser = await prisma.labUser.findUnique({
      where: { user_id: user.id },
      select: { lab_id: true },
    });
    labId = labUser?.lab_id ?? null;
  } else {
    // lab_member — look up via LabMember table
    const member = await prisma.labMember.findUnique({
      where: { user_id: user.id },
      select: { lab_id: true },
    });
    labId = member?.lab_id ?? null;
  }

  if (!labId) redirect("/lab-login");

  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    select: {
      id: true,
      name: true,
      logo_url: true,
      address: true,
      description: true,
      phones: true,
      service_categories: true,
      certifications: true,
    },
  });

  if (!lab) redirect("/lab-login");

  return (
    <LabDashboard
      isOwner={role === "lab"}
      lab={{
        id: lab.id,
        name: lab.name,
        logo_url: lab.logo_url,
        address: lab.address,
        description: lab.description,
        phones: lab.phones as string[],
        service_categories: lab.service_categories as string[],
        certifications: lab.certifications as string[],
      }}
    />
  );
}
