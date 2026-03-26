import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "NOT SET",
    anon_key_prefix: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 20) ?? "NOT SET",
    has_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
