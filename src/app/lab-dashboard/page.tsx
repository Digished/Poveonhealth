import { redirect } from "next/navigation";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { LabDashboard } from "@/components/LabDashboard";

export const metadata = {
  title: "Lab Dashboard — Poveon",
};

export default async function LabDashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== "lab") {
    redirect("/lab-login");
  }

  const adminClient = createAdminClient();
  const { data: labUser } = await adminClient
    .from("lab_users")
    .select(
      "lab_id, labs(id, name, logo_url, address, description, phones, service_categories, certifications)"
    )
    .eq("user_id", user.id)
    .single();

  if (!labUser) {
    redirect("/lab-login");
  }

  const lab = labUser.labs as unknown as {
    id: string;
    name: string;
    logo_url: string | null;
    address: string;
    description: string;
    phones: string[];
    service_categories: string[];
    certifications: string[];
  } | null;

  return (
    <LabDashboard
      lab={{
        id: lab?.id ?? labUser.lab_id,
        name: lab?.name ?? "Laboratory",
        logo_url: lab?.logo_url ?? null,
        address: lab?.address ?? "",
        description: lab?.description ?? "",
        phones: (lab?.phones as string[]) ?? [],
        service_categories: (lab?.service_categories as string[]) ?? [],
        certifications: (lab?.certifications as string[]) ?? [],
      }}
    />
  );
}
