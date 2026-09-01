/**
 * Which portal this device signs into.
 *
 * The installed app opens on /signin, which uses this to send a returning user
 * straight to the side they actually use. Stored per-device, never sent
 * anywhere — it's a convenience, not an identity.
 */
export const LAST_PORTAL_KEY = "poveon_last_portal";

export type PortalKey = "patient" | "doctor";

export function rememberPortal(portal: PortalKey) {
  try {
    localStorage.setItem(LAST_PORTAL_KEY, portal);
  } catch {
    /* private mode — the chooser just asks again next time */
  }
}
