import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { CustomersLive } from "@/components/lab/CustomersLive";

export const metadata = {
  title: "Customers — Live | Poveon",
};

/**
 * Pop-out live customers board — opened in its own browser tab from the
 * dashboard's Customers view. Auto-refreshes in real time.
 */
export default async function LabCustomersLivePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const role = user?.user_metadata?.role;
  if (!user || (role !== "lab" && role !== "lab_member")) {
    redirect("/lab-login");
  }

  let labId: string | null = null;
  let canViewClients = true;

  if (role === "lab") {
    const labUser = await prisma.labUser.findUnique({
      where: { user_id: user.id },
      select: { lab_id: true },
    });
    labId = labUser?.lab_id ?? null;
  } else {
    const member = await prisma.labMember.findUnique({
      where: { user_id: user.id },
      select: { lab_id: true, role: { select: { can_view_clients: true } } },
    });
    labId = member?.lab_id ?? null;
    canViewClients = member?.role.can_view_clients ?? false;
  }

  if (!labId || !canViewClients) redirect("/lab-dashboard");

  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    select: { name: true, logo_url: true },
  });
  if (!lab) redirect("/lab-login");

  return <CustomersLive labName={lab.name} labLogoUrl={lab.logo_url} />;
}
