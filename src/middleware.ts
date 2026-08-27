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

  const { pathname } = request.nextUrl;

  // ── Supabase session refresh (existing auth logic) ─────────────────────────
  // Only the Supabase-authenticated areas need the user: resolving it calls the
  // Supabase Auth API, and doing that on every asset, page and API request was
  // thousands of pointless round trips a day. Cookie-token routes below are
  // checked without it.
  const needsSupabaseUser =
    pathname.startsWith("/lab-dashboard") ||
    pathname.startsWith("/admin") ||
    pathname === "/lab-login";

  let response = NextResponse.next({ request });

  if (!needsSupabaseUser) {
    return cookieOnlyRoutes(request, response);
  }

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

  return cookieOnlyRoutes(request, response);
}

/**
 * Guards for the portals that authenticate with their own signed cookie rather
 * than Supabase — no Auth API call needed, just a cookie presence check.
 */
function cookieOnlyRoutes(request: NextRequest, response: NextResponse): NextResponse {
  const { pathname } = request.nextUrl;

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

  // ── EMR staff workspace ────────────────────────────────────────────────────
  if (pathname.startsWith("/emr") && pathname !== "/emr-login") {
    const token = request.cookies.get("emr_token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/emr-login", request.url));
    }
  }

  // ── Redirect signed-in staff away from the EMR login ──────────────────────
  if (pathname === "/emr-login") {
    const token = request.cookies.get("emr_token")?.value;
    if (token) {
      return NextResponse.redirect(new URL("/emr", request.url));
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

  // ── HMO member portal (vitals monitoring) ──────────────────────────────────
  if (pathname.startsWith("/hmo/dashboard")) {
    const token = request.cookies.get("hmo_token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/hmo", request.url));
    }
  }

  // ── Redirect authenticated HMO members away from the HMO login ─────────────
  if (pathname === "/hmo") {
    const token = request.cookies.get("hmo_token")?.value;
    if (token) {
      return NextResponse.redirect(new URL("/hmo/dashboard", request.url));
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
