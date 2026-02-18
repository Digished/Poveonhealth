import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
        setAll(cookiesToSet) {
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

  // ── Lab Dashboard ──────────────────────────────────────────────────────────
  if (pathname.startsWith("/lab-dashboard")) {
    if (!user) {
      return NextResponse.redirect(new URL("/lab-login", request.url));
    }
    const role = user.user_metadata?.role;
    if (role !== "lab") {
      return NextResponse.redirect(new URL("/lab-login", request.url));
    }
  }

  // ── Admin ──────────────────────────────────────────────────────────────────
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin-login")) {
    if (!user) {
      return NextResponse.redirect(new URL("/admin-login", request.url));
    }
    const role = user.user_metadata?.role;
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/admin-login", request.url));
    }
  }

  // ── Redirect authenticated lab users away from login page ─────────────────
  if (pathname === "/lab-login" && user?.user_metadata?.role === "lab") {
    return NextResponse.redirect(new URL("/lab-dashboard", request.url));
  }

  // ── Redirect authenticated admin users away from admin-login ──────────────
  if (
    pathname === "/admin-login" &&
    user?.user_metadata?.role === "admin"
  ) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/lab-dashboard/:path*",
    "/admin/:path*",
    "/admin-login",
    "/lab-login",
  ],
};
