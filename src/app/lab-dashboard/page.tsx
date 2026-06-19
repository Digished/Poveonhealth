import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { LabDashboard } from "@/components/LabDashboard";
import { defaultTabForRole } from "@/lib/lab-roles";

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
  let roleName = "Lab Owner";
  let canViewReferrals = true;
  let canViewClients = true;
  let canViewAnalytics = true;
  let canViewActivity = true;
  let canViewFeedback = true;
  let canViewWallet = true;
  let canViewMarketers = false;
  let canManageRoles = false;
  let canManageProfessionals = false;
  let canManageTemplates = false;
  // Action / view permissions used to gate the new sidebar items.
  let canViewRequests = true;
  let canMarkSeen = true;
  let canMarkDone = true;
  let canSendResults = true;
  let defaultTab: string | null = null;
  let memberDepartment: string | null = null;

  if (role === "lab") {
    const labUser = await prisma.labUser.findUnique({
      where: { user_id: user.id },
      select: { lab_id: true },
    });
    labId = labUser?.lab_id ?? null;
    canViewMarketers = true; // Lab owners can manage marketers
    canManageRoles = true;
    canManageProfessionals = true;
    canManageTemplates = true;
  } else {
    // lab_member — look up via LabMember table
    const member = await prisma.labMember.findUnique({
      where: { user_id: user.id },
      select: {
        lab_id: true,
        role: { select: { name: true, department: true, can_view_requests: true, can_mark_seen: true, can_mark_done: true, can_send_results: true, can_view_referrals: true, can_view_clients: true, can_view_analytics: true, can_view_activity: true, can_view_feedback: true, can_view_wallet: true, can_view_marketers: true, can_manage_roles: true, can_manage_professionals: true, can_manage_templates: true } },
      },
    });
    labId = member?.lab_id ?? null;
    roleName = member?.role.name ?? "Member";
    canViewRequests = member?.role.can_view_requests ?? false;
    canMarkSeen = member?.role.can_mark_seen ?? false;
    canMarkDone = member?.role.can_mark_done ?? false;
    canSendResults = member?.role.can_send_results ?? false;
    canViewReferrals = member?.role.can_view_referrals ?? false;
    canViewClients = member?.role.can_view_clients ?? false;
    canViewAnalytics = member?.role.can_view_analytics ?? false;
    canViewActivity = member?.role.can_view_activity ?? false;
    canViewFeedback = member?.role.can_view_feedback ?? false;
    canViewWallet = member?.role.can_view_wallet ?? false;
    canViewMarketers = member?.role.can_view_marketers ?? false;
    canManageRoles = member?.role.can_manage_roles ?? false;
    canManageProfessionals = member?.role.can_manage_professionals ?? false;
    canManageTemplates = member?.role.can_manage_templates ?? false;
    memberDepartment = member?.role.department ?? null;
    defaultTab = defaultTabForRole(roleName);
  }

  if (!labId) redirect("/lab-login");

  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    select: {
      id: true,
      name: true,
      slug: true,
      logo_url: true,
      address: true,
      description: true,
      phones: true,
      whatsapp: true,
      service_categories: true,
      certifications: true,
    },
  });

  if (!lab) redirect("/lab-login");

  return (
    <LabDashboard
      isOwner={role === "lab"}
      roleName={roleName}
      canViewReferrals={canViewReferrals}
      canViewClients={canViewClients}
      canViewAnalytics={canViewAnalytics}
      canViewActivity={canViewActivity}
      canViewFeedback={canViewFeedback}
      canViewWallet={canViewWallet}
      canViewMarketers={canViewMarketers}
      canManageRoles={canManageRoles}
      canManageProfessionals={canManageProfessionals}
      canManageTemplates={canManageTemplates}
      canViewRequests={canViewRequests}
      canMarkSeen={canMarkSeen}
      canMarkDone={canMarkDone}
      canSendResults={canSendResults}
      defaultTab={defaultTab}
      memberDepartment={memberDepartment}
      lab={{
        id: lab.id,
        name: lab.name,
        slug: lab.slug,
        logo_url: lab.logo_url,
        address: lab.address,
        description: lab.description,
        phones: lab.phones,
        whatsapp: lab.whatsapp,
        service_categories: lab.service_categories as string[],
        certifications: lab.certifications as string[],
      }}
    />
  );
}
