import { redirect } from "next/navigation";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { AdminPricing } from "@/components/AdminPricing";

export const metadata = { title: "Pricing Catalog — Poveon Admin" };

export default async function AdminPricingPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== "admin") redirect("/admin-login");

  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminUser) redirect("/admin-login");

  return <AdminPricing />;
}
