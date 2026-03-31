// =============================================================================
// Phone number utilities — labeled phone entries
// =============================================================================

export interface PhoneEntry {
  number: string;
  label: string; // e.g. "Front Desk", "Customer Care", "" = no label
}

/**
 * Parses phones from any stored format.
 * Backward-compatible: handles old string[] and new PhoneEntry[].
 */
export function parsePhones(raw: unknown): PhoneEntry[] {
  if (!Array.isArray(raw)) {
    if (typeof raw === "string") {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) return parsePhones(p);
      } catch {}
    }
    return [];
  }
  return (raw as unknown[])
    .map((item): PhoneEntry => {
      if (typeof item === "string") return { number: item, label: "" };
      if (item && typeof item === "object" && "number" in item) {
        return {
          number: String((item as Record<string, unknown>).number ?? ""),
          label: typeof (item as Record<string, unknown>).label === "string"
            ? String((item as Record<string, unknown>).label)
            : "",
        };
      }
      return { number: String(item), label: "" };
    })
    .filter((e) => e.number.trim() !== "");
}

/** Format for display: "Label: +234..." or just "+234..." */
export function formatPhone(entry: PhoneEntry): string {
  return entry.label ? `${entry.label}: ${entry.number}` : entry.number;
}

/** For email templates and other places that need plain strings */
export function phonesToStrings(phones: PhoneEntry[]): string[] {
  return phones.map(formatPhone);
}
