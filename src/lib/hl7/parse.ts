/**
 * Minimal HL7 v2.x parser for inbound ORU^R01 result messages arriving from a
 * lab's Mirth channel (Mirth normalises analyzer ASTM → HL7 in-channel, so
 * Poveon only ever parses HL7 here).
 *
 * Deliberately tolerant: it reads the handful of fields we need (message type,
 * control id, the Poveon request code in PID-3, and OBX observations) and
 * ignores everything else.
 */

/** Reverse the standard HL7 escape sequences produced by our builder. */
function unesc(v: string): string {
  return v
    .replace(/\\F\\/g, "|")
    .replace(/\\S\\/g, "^")
    .replace(/\\R\\/g, "~")
    .replace(/\\T\\/g, "&")
    .replace(/\\X0A\\/gi, "\n")
    .replace(/\\E\\/g, "\\");
}

export interface ParsedObservation {
  code: string; // OBX-3 first component
  name: string; // OBX-3 second component
  value: string; // OBX-5
  unit: string; // OBX-6
  reference_range: string; // OBX-7
  flag: string; // OBX-8
}

export interface ParsedHl7 {
  messageType: string; // MSH-9
  controlId: string; // MSH-10
  requestCode: string | null; // PID-3 (Poveon request code)
  orderId: string | null; // OBR-3 filler/placer (our result id, when round-tripping)
  observations: ParsedObservation[];
  comment: string | null; // first NTE
}

/** Split an HL7 message into segments, tolerant of \r, \n or \r\n separators. */
function splitSegments(message: string): string[] {
  return message.split(/\r\n|\r|\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Parse an inbound HL7 message. Returns null if it isn't recognisable HL7
 * (no MSH). Field/component delimiters are read from MSH rather than assumed.
 */
export function parseHl7(message: string): ParsedHl7 | null {
  const segments = splitSegments(message);
  const msh = segments.find((s) => s.startsWith("MSH"));
  if (!msh) return null;

  // MSH-1 is the field separator (char at index 3), MSH-2 gives the rest.
  const fieldSep = msh[3] || "|";
  const enc = msh.slice(4, msh.indexOf(fieldSep, 4) === -1 ? undefined : msh.indexOf(fieldSep, 4));
  const compSep = enc[0] || "^";

  const fields = (seg: string) => seg.split(fieldSep);
  const comp = (field: string | undefined, i: number) => (field ? unesc(field.split(compSep)[i] ?? "") : "");

  const mshF = fields(msh);
  // For MSH, field indices are shifted by one because MSH-1 IS the separator:
  // mshF[0]='MSH', mshF[1]='^~\&' (MSH-2), mshF[8]=MSH-9, mshF[9]=MSH-10.
  const messageType = unesc(mshF[8] ?? "").replace(compSep, "^") || "";
  const controlId = unesc(mshF[9] ?? "");

  let requestCode: string | null = null;
  let orderId: string | null = null;
  let comment: string | null = null;
  const observations: ParsedObservation[] = [];

  for (const seg of segments) {
    if (seg.startsWith("PID")) {
      const f = fields(seg);
      // PID-3 patient identifier list — first component is our request code.
      const pid3 = comp(f[3], 0);
      if (pid3) requestCode = pid3;
    } else if (seg.startsWith("OBR")) {
      const f = fields(seg);
      const obr3 = comp(f[3], 0);
      if (obr3) orderId = obr3;
    } else if (seg.startsWith("OBX")) {
      const f = fields(seg);
      const id = f[3] ?? "";
      observations.push({
        code: unesc(id.split(compSep)[0] ?? ""),
        name: unesc(id.split(compSep)[1] ?? ""),
        value: unesc(f[5] ?? ""),
        unit: unesc(f[6] ?? ""),
        reference_range: unesc(f[7] ?? ""),
        flag: unesc(f[8] ?? ""),
      });
    } else if (seg.startsWith("NTE") && comment === null) {
      const f = fields(seg);
      const text = unesc(f[3] ?? "");
      if (text) comment = text;
    }
  }

  return { messageType, controlId, requestCode, orderId, observations, comment };
}
