/**
 * Canonical URLs for a lab's public pages.
 *
 * Labs live on their own subdomain — `synlab.poveon.com/o` rather than
 * `poveon.com/o/synlab`. Every link the app generates goes through here so the
 * shape is decided in one place, and the legacy path form keeps working: the
 * lab pages redirect to the subdomain, so old QR codes and shared links land
 * in the right place instead of erroring.
 *
 * Switched on with NEXT_PUBLIC_LAB_SUBDOMAINS=1 (set it once wildcard DNS for
 * *.poveon.com is live). Until then every helper returns the path form, so
 * nothing changes.
 */

export const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "poveon.com").replace(/^https?:\/\//, "").replace(/\/$/, "");

export const LAB_SUBDOMAINS_ENABLED = process.env.NEXT_PUBLIC_LAB_SUBDOMAINS === "1";

/** Hosts that can never carry a lab subdomain (local dev, preview deploys). */
function hostSupportsSubdomains(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0].toLowerCase();
  return hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`);
}

/** The lab subdomain a slug belongs on, e.g. "synlab" → "synlab.poveon.com". */
export function labHost(slug: string): string {
  return `${slug}.${ROOT_DOMAIN}`;
}

/**
 * True when this request should be redirected onto the lab's own subdomain:
 * the feature is on, the deployment is on the real domain, and we are not
 * already there.
 */
export function shouldRedirectToLabHost(slug: string, currentHost: string | null | undefined): boolean {
  if (!LAB_SUBDOMAINS_ENABLED || !slug) return false;
  if (!hostSupportsSubdomains(currentHost)) return false;
  const hostname = (currentHost ?? "").split(":")[0].toLowerCase();
  return hostname !== labHost(slug);
}

/**
 * A public lab URL. `path` is the part after the lab, e.g. "/" (the lab page),
 * "/o" (self-registration), "/f" (feedback), "/o/q/ABC123" (queue status).
 *
 * With subdomains on:  https://synlab.poveon.com/o
 * With them off:       https://poveon.com/o/synlab
 */
export function labUrl(slug: string, path = "/", origin?: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;

  if (LAB_SUBDOMAINS_ENABLED) {
    return `https://${labHost(slug)}${clean === "/" ? "" : clean}`;
  }

  const base = (origin ?? process.env.NEXT_PUBLIC_APP_URL ?? `https://${ROOT_DOMAIN}`).replace(/\/$/, "");
  if (clean === "/") return `${base}/${slug}`;
  // /o + slug → /o/slug ; /o/q/CODE + slug → /o/slug/q/CODE
  const [, section, ...rest] = clean.split("/");
  return `${base}/${section}/${slug}${rest.length ? `/${rest.join("/")}` : ""}`;
}
