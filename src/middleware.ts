import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  // ── Subdomain → path rewrite ───────────────────────────────────────────────
  // acmelabs.poveon.com  →  internally served as  /acmelabs
  const host = request.headers.get("host") ?? "";
  const hostname = host.split(":")[0]; // strip port for local dev
  const rootDomain = process.env.ROOT_DOMAIN ?? "poveon.com";

  const isSubdomain =
    hostname !== rootDomain &&
    hostname !== `www.${rootDomain}` &&
    hostname.endsWith(`.${rootDomain}`);

  if (isSubdomain) {
    const slug = hostname.slice(0, -(`.${rootDomain}`.length));
    const url = request.nextUrl.clone();

    // Rewrite root to the lab's page
    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = `/${slug}`;
      return NextResponse.rewrite(url);
    }

    // API calls made by the form on the subdomain must pass through unchanged
    if (url.pathname.startsWith("/api/")) {
      return NextResponse.next();
    }

    // Everything else (doc-login, dashboard, etc.) — redirect to main domain
    // so links like /doc-login work correctly
    const mainUrl = new URL(request.url);
    mainUrl.hostname = rootDomain;
    return NextResponse.redirect(mainUrl, 302);
  }

  // ── Supabase session refresh (existing auth logic) ─────────────────────────
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
  }

  // ── Redirect authenticated marketers away from login page ─────────────────
  if (pathname === "/scale") {
    const token = request.cookies.get("scale_token")?.value;
    if (token) {
      return NextResponse.redirect(new URL("/scale/dashboard", request.url));
    }
  }

  // ── Patient Dashboard ──────────────────────────────────────────────────────
  if (pathname.startsWith("/dashboard")) {
    const token = request.cookies.get("patient_token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // ── Redirect authenticated patients away from login page ──────────────────
  if (pathname === "/login") {
    const token = request.cookies.get("patient_token")?.value;
    if (token) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico, sitemap.xml, robots.txt
     * - Public asset extensions
     * The subdomain check runs first; the Supabase auth check only runs for
     * non-subdomain requests that hit the protected routes below.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf|css|js)$).*)",
  ],
};
