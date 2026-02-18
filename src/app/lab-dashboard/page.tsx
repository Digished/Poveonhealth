import { redirect } from "next/navigation";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { LabDashboard } from "@/components/LabDashboard";

export const metadata = {
  title: "Lab Dashboard — Poveon Health",
};

export default async function LabDashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== "lab") {
    redirect("/lab-login");
  }

  // Fetch this lab's info
  const adminClient = createAdminClient();
  const { data: labUser } = await adminClient
    .from("lab_users")
    .select("lab_id, labs(id, name)")
    .eq("user_id", user.id)
    .single();

  if (!labUser) {
    redirect("/lab-login");
  }

  const lab = labUser.labs as { id: string; name: string } | null;

  return (
    <LabDashboard
      labName={lab?.name ?? "Laboratory"}
      labId={labUser.lab_id}
    />
  );
}
