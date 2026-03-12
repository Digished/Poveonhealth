import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const role = user?.user_metadata?.role;

  // ── Lab Dashboard ──────────────────────────────────────────────────────────
  if (pathname.startsWith("/lab-dashboard")) {
    if (!user || (role !== "lab" && role !== "lab_member")) {
      return NextResponse.redirect(new URL("/lab-login", request.url));
    }
  }

  // ── Admin ──────────────────────────────────────────────────────────────────
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin-login")) {
    if (!user || role !== "admin") {
      return NextResponse.redirect(new URL("/admin-login", request.url));
    }
  }

  // ── Redirect authenticated lab users away from login page ─────────────────
  if (pathname === "/lab-login" && (role === "lab" || role === "lab_member")) {
    return NextResponse.redirect(new URL("/lab-dashboard", request.url));
  }

  // ── Redirect authenticated admin users away from admin-login ──────────────
  if (pathname === "/admin-login" && role === "admin") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  // ── Scale (Marketer) Dashboard ─────────────────────────────────────────────
  if (pathname.startsWith("/scale/dashboard")) {
    const token = request.cookies.get("scale_token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/scale", request.url));
    }
    // Session validity is checked in the API; middleware only verifies cookie presence
  }

  // ── Redirect authenticated marketers away from login page ─────────────────
  if (pathname === "/scale") {
    const token = request.cookies.get("scale_token")?.value;
    if (token) {
      return NextResponse.redirect(new URL("/scale/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/lab-dashboard/:path*",
    "/admin/:path*",
    "/admin-login",
    "/lab-login",
    "/scale",
    "/scale/dashboard/:path*",
  ],
};
