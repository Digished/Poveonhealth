import QRCode from "qrcode";
import { appUrl } from "@/lib/consult";

/**
 * The QR code a partner puts on their counter.
 *
 * Scanning it starts the care-plan sign-up with that partner already chosen —
 * which is the point: a pharmacy that brings someone onto the plan should not
 * then have to ask them to find it in a list of hundreds.
 *
 * The link carries the partner's public code, not its id, so it stays readable
 * and a printed poster survives a database restore.
 */
export type PartnerKind = "pharmacy" | "lab";

export function partnerJoinUrl(kind: PartnerKind, code: string): string {
  const param = kind === "pharmacy" ? "pharmacy" : "lab";
  return `${appUrl()}/consults?${param}=${encodeURIComponent(code)}`;
}

/** A PNG of the join link, sized for print. */
export async function partnerQrPng(kind: PartnerKind, code: string, width = 720): Promise<Buffer> {
  return QRCode.toBuffer(partnerJoinUrl(kind, code), {
    type: "png",
    width,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

/** An inline SVG of the same, for embedding in a page or a printable card. */
export async function partnerQrSvg(kind: PartnerKind, code: string): Promise<string> {
  return QRCode.toString(partnerJoinUrl(kind, code), {
    type: "svg",
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}
