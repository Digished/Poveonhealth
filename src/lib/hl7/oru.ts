/**
 * Minimal, dependency-free HL7 v2.x ORU^R01 (unsolicited result) builder.
 *
 * Segments are joined with \r (carriage return) per the HL7 standard — Mirth's
 * HTTP Listener accepts the raw message in the request body. Field values are
 * escaped for the standard delimiter set.
 */

// Standard HL7 encoding characters (MSH-1 = |, MSH-2 = ^~\&).
const FIELD = "|";
const COMP = "^";
const REP = "~";
const ESC = "\\";
const SUB = "&";

/** Escape a value for HL7 delimiters (HL7 escape sequences \F\ \S\ \R\ \E\ \T\). */
function esc(v: string | null | undefined): string {
  if (v == null) return "";
  return String(v)
    .replace(/\\/g, "\\E\\")
    .replace(/\|/g, "\\F\\")
    .replace(/\^/g, "\\S\\")
    .replace(/~/g, "\\R\\")
    .replace(/&/g, "\\T\\")
    .replace(/\r?\n/g, "\\X0A\\");
}

/** HL7 timestamp: YYYYMMDDHHMMSS (local time). */
export function hl7Date(d: Date | null | undefined): string {
  const dt = d ?? new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}${p(dt.getMonth() + 1)}${p(dt.getDate())}${p(dt.getHours())}${p(dt.getMinutes())}${p(dt.getSeconds())}`;
}

/** Map an internal H/L flag to an HL7 OBX-8 abnormal-flag value. */
function abnormalFlag(flag: string | undefined): string {
  if (flag === "H") return "H";
  if (flag === "L") return "L";
  if (flag === "HH") return "HH";
  if (flag === "LL") return "LL";
  if (flag === "A") return "A";
  return "";
}

/** Is the observation value numeric (→ OBX-2 = NM) or a string (→ ST)? */
function valueType(value: string | undefined): "NM" | "ST" {
  if (value == null || value === "") return "ST";
  return /^-?\d+(\.\d+)?$/.test(value.trim()) ? "NM" : "ST";
}

/** Map a free-text sex to an HL7 administrative sex code. */
function sexCode(sex: string | null | undefined): string {
  const s = (sex ?? "").trim().toLowerCase();
  if (s.startsWith("m")) return "M";
  if (s.startsWith("f")) return "F";
  return "U";
}

export interface OruObservation {
  name: string;
  value?: string;
  unit?: string;
  reference_range?: string;
  flag?: string;
  loinc?: string;
  test_code?: string;
}

export interface OruInput {
  labName: string;
  sendingFacility?: string;
  receivingApp?: string;
  receivingFacility?: string;
  request: {
    code: string;
    patient_name?: string | null;
    patient_age?: number | null;
    sex?: string | null;
    patient_phone?: string | null;
  };
  result: {
    id: string;
    department?: string | null;
    comment?: string | null;
    verified_by?: string | null;
    verified_at?: Date | null;
    orderName?: string | null; // OBR-4 name (e.g. template name)
    observations: OruObservation[];
  };
  controlId: string;
  messageDateTime?: Date;
}

/** Split a person name into HL7 XPN components: family^given. */
function nameComponents(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  const parts = n.split(/\s+/);
  if (parts.length === 1) return esc(parts[0]);
  const family = parts[parts.length - 1];
  const given = parts.slice(0, -1).join(" ");
  return `${esc(family)}${COMP}${esc(given)}`;
}

/** Build the OBX-3 observation identifier: code^name^coding-system. */
function obxIdentifier(o: OruObservation): string {
  const code = o.loinc || o.test_code || "";
  const system = o.loinc ? "LN" : o.test_code ? "L" : "";
  return `${esc(code)}${COMP}${esc(o.name)}${COMP}${esc(system)}`;
}

/**
 * Build an ORU^R01 message. Returns the raw HL7 string (\r-joined) plus the
 * control id and message type for auditing.
 */
export function buildOru(input: OruInput): { message: string; controlId: string; messageType: string } {
  const now = input.messageDateTime ?? new Date();
  const sendingApp = "POVEON";
  const sendingFacility = input.sendingFacility || input.labName;
  const receivingApp = input.receivingApp || "MIRTH";
  const receivingFacility = input.receivingFacility || "";
  const messageType = "ORU^R01";

  const seg: string[] = [];

  // MSH — encoding chars are literal (not escaped).
  seg.push([
    "MSH",
    `${COMP}${REP}${ESC}${SUB}`,
    esc(sendingApp),
    esc(sendingFacility),
    esc(receivingApp),
    esc(receivingFacility),
    hl7Date(now),
    "",
    `ORU${COMP}R01`,
    esc(input.controlId),
    "P",
    "2.5.1",
  ].join(FIELD));

  // PID — patient identity. PID-3 uses the Poveon request code as the id.
  seg.push([
    "PID",
    "1",
    "",
    esc(input.request.code),
    "",
    nameComponents(input.request.patient_name),
    "",
    "", // DOB unknown (age only)
    sexCode(input.request.sex),
    "",
    "",
    "",
    "",
    esc(input.request.patient_phone ?? ""),
  ].join(FIELD));

  // OBR — the order/report header.
  seg.push([
    "OBR",
    "1",
    "",
    esc(input.result.id),
    esc(input.result.orderName ?? input.result.department ?? "Laboratory Result"),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    hl7Date(input.result.verified_at ?? now),
    "",
    "",
    "F",
  ].join(FIELD));

  // OBX — one per observation.
  let n = 0;
  for (const o of input.result.observations) {
    n += 1;
    seg.push([
      "OBX",
      String(n),
      valueType(o.value),
      obxIdentifier(o),
      "",
      esc(o.value ?? ""),
      esc(o.unit ?? ""),
      esc(o.reference_range ?? ""),
      abnormalFlag(o.flag),
      "",
      "",
      "F",
      "",
      hl7Date(input.result.verified_at ?? now),
    ].join(FIELD));
  }

  // NTE — optional interpretive comment.
  if (input.result.comment && input.result.comment.trim()) {
    seg.push(["NTE", "1", "", esc(input.result.comment)].join(FIELD));
  }

  return { message: seg.join("\r"), controlId: input.controlId, messageType };
}
