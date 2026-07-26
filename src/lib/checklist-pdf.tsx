import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

/**
 * Branded "Patient Visit Checklist" — the hand-off slip a client takes around
 * the laboratory after the front desk has verified their tests. Lists patient
 * details, the referring doctor, and every requested test as a tick-box
 * checklist grouped by the department that performs it.
 *
 * Sized for an 80mm thermal/POS receipt roll (the printer most front desks
 * already have) rather than A4: one narrow column, compact type, and a page
 * height estimated from the content so the printer doesn't feed a long blank
 * tail. Built on the same Helvetica/no-font-download approach as the result
 * and agreement PDFs.
 *
 * Prices are deliberately never rendered here — this slip is handled by the
 * client and walked around the departments, so it must not expose billing.
 */
const BLUE = "#0259a0";
const INK = "#0f172a";
const SLATE = "#64748b";
const LIGHT = "#94a3b8";

/** 80mm POS roll ≈ 226.77pt wide. */
const PAGE_WIDTH = 226.77;
const PAGE_PADDING = 10;

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 7.5, color: INK, paddingTop: 10, paddingBottom: 12, paddingHorizontal: PAGE_PADDING, lineHeight: 1.35 },

  header: { alignItems: "center", borderBottomWidth: 1.5, borderBottomColor: BLUE, paddingBottom: 6 },
  logo: { width: 34, height: 34, marginBottom: 4, objectFit: "contain" },
  labName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK, textAlign: "center" },
  labMeta: { fontSize: 6, color: SLATE, marginTop: 1.5, textAlign: "center" },

  docTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 0.8, textAlign: "center", marginTop: 6 },
  codeText: { fontSize: 13, fontFamily: "Helvetica-Bold", color: BLUE, letterSpacing: 1, textAlign: "center", marginTop: 1 },
  metaDate: { fontSize: 6.5, color: SLATE, textAlign: "center", marginTop: 1 },

  divider: { borderBottomWidth: 0.75, borderBottomColor: "#cbd5e1", borderBottomStyle: "dashed", marginVertical: 6 },

  sectionLabel: { fontSize: 6, fontFamily: "Helvetica-Bold", color: LIGHT, textTransform: "uppercase", letterSpacing: 0.9, marginBottom: 3 },
  field: { flexDirection: "row", marginBottom: 1.5 },
  fieldLabel: { fontSize: 6.5, color: SLATE, width: 42 },
  fieldValue: { fontSize: 7.5, color: INK, fontFamily: "Helvetica-Bold", flex: 1 },

  noteText: { fontSize: 7, color: INK, lineHeight: 1.4 },

  instruction: { backgroundColor: "#f0f7ff", borderWidth: 0.75, borderColor: "#bfdbfe", borderRadius: 3, padding: 5, marginTop: 6 },
  instructionText: { fontSize: 6.5, color: "#1e3a5f", lineHeight: 1.45 },

  deptHeading: { backgroundColor: "#eef5fb", borderLeftWidth: 2, borderLeftColor: BLUE, paddingVertical: 3, paddingHorizontal: 5, marginTop: 7, marginBottom: 1 },
  deptName: { fontSize: 8, fontFamily: "Helvetica-Bold", color: BLUE },
  deptHint: { fontSize: 6, color: SLATE, marginTop: 0.5 },

  testRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#eef2f7" },
  checkbox: { width: 9, height: 9, borderWidth: 0.75, borderColor: "#64748b", borderRadius: 1.5, marginRight: 5, marginTop: 0.5 },
  testBody: { flex: 1 },
  testName: { fontSize: 7.5, color: INK, fontFamily: "Helvetica-Bold" },
  testSub: { fontSize: 6, color: LIGHT },
  staffLine: { flexDirection: "row", marginTop: 3, gap: 6 },
  staffCell: { flex: 1 },
  staffLabel: { fontSize: 5.5, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.4 },
  rule: { borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1", height: 8 },

  verifyBlock: { marginTop: 10 },
  verifyCol: { marginBottom: 8 },
  verifyLabel: { fontSize: 6, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.6 },
  verifyLine: { borderBottomWidth: 0.75, borderBottomColor: "#94a3b8", height: 14, marginTop: 1 },
  verifyValue: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: INK, marginTop: 1 },

  footer: { borderTopWidth: 0.75, borderTopColor: "#e2e8f0", paddingTop: 5, marginTop: 8, alignItems: "center" },
  footerText: { fontSize: 5.5, color: LIGHT, textAlign: "center" },
});

export type ChecklistTest = { name: string; sub?: string | null };
export type ChecklistGroup = { department: string; hint: string; tests: ChecklistTest[] };

export type VisitChecklistProps = {
  labName: string;
  labLogo?: string | null;        // data: URL (PNG/JPEG) or null
  labAddress?: string | null;
  labPhones?: string | null;
  code: string;
  generatedAt: Date;
  patientName?: string | null;
  patientAge?: number | null;
  patientSex?: string | null;
  patientPhone?: string | null;
  patientEmail?: string | null;
  doctorName?: string | null;
  doctorHospital?: string | null;
  doctorPhone?: string | null;
  doctorEmail?: string | null;
  /** The request exactly as the doctor wrote it (Fast Mode raw text). */
  rawText?: string | null;
  /** Clinical details / diagnosis accompanying the request. */
  diagnosis?: string | null;
  groups: ChecklistGroup[];
  verifiedBy?: string | null;
};

/**
 * Estimate the roll length needed so the printer feeds roughly the content
 * height instead of a fixed sheet. Deliberately generous — over-estimating
 * costs a little blank paper, under-estimating splits the slip across pages.
 */
function estimateHeight(props: VisitChecklistProps): number {
  let h = 190; // header, code block and the patient panel
  if (props.labLogo) h += 38;
  if (props.doctorName || props.doctorHospital || props.doctorPhone) h += 50;
  if (props.rawText) h += 20 + Math.ceil(props.rawText.length / 44) * 11;
  if (props.diagnosis) h += 20 + Math.ceil(props.diagnosis.length / 44) * 11;
  h += 56; // instruction box
  for (const g of props.groups) {
    h += 32; // department heading
    for (const t of g.tests) h += t.sub ? 58 : 48;
  }
  h += 96; // verification + signature
  h += 34; // footer
  return Math.max(340, Math.ceil(h));
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value || !value.trim()) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export function VisitChecklistPdf(props: VisitChecklistProps) {
  const dateStr = props.generatedAt.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const hasReferral = !!(props.doctorName || props.doctorHospital || props.doctorPhone);

  return (
    <Document title={`Visit checklist ${props.code}`} author={props.labName}>
      <Page size={[PAGE_WIDTH, estimateHeight(props)]} style={styles.page}>
        {/* Header — logo, lab identity, code + date, all centred receipt-style */}
        <View style={styles.header}>
          {props.labLogo ? <Image style={styles.logo} src={props.labLogo} /> : null}
          <Text style={styles.labName}>{props.labName}</Text>
          {props.labAddress ? <Text style={styles.labMeta}>{props.labAddress}</Text> : null}
          {props.labPhones ? <Text style={styles.labMeta}>{props.labPhones}</Text> : null}
        </View>

        <Text style={styles.docTitle}>Patient Visit Checklist</Text>
        <Text style={styles.codeText}>{props.code}</Text>
        <Text style={styles.metaDate}>{dateStr}</Text>

        <View style={styles.divider} />

        {/* Patient */}
        <Text style={styles.sectionLabel}>Patient</Text>
        <Row label="Name" value={props.patientName} />
        <Row label="Age/Sex" value={[props.patientAge != null ? `${props.patientAge} yrs` : null, props.patientSex].filter(Boolean).join(" · ") || null} />
        <Row label="Phone" value={props.patientPhone} />

        {/* Referral — only when there is something to show */}
        {hasReferral ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>Referral</Text>
            <Row label="Doctor" value={props.doctorName} />
            <Row label="Hospital" value={props.doctorHospital} />
            <Row label="Phone" value={props.doctorPhone} />
          </>
        ) : null}

        {/* The request as the doctor wrote it + clinical details */}
        {(props.rawText || props.diagnosis) ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>Doctor&apos;s request</Text>
            {props.rawText ? <Text style={styles.noteText}>&ldquo;{props.rawText}&rdquo;</Text> : null}
            {props.diagnosis ? <Row label="Clinical" value={props.diagnosis} /> : null}
          </>
        ) : null}

        <View style={styles.instruction}>
          <Text style={styles.instructionText}>
            Present this slip at each department below. Staff will tick each test and add their initials and the time. Keep this copy until all tests are done.
          </Text>
        </View>

        {/* Test checklist grouped by department. Rows stay atomic so a test
            never splits across a page break on a long roll. */}
        {props.groups.map((g, gi) => (
          <View key={gi}>
            <View style={styles.deptHeading} wrap={false} minPresenceAhead={40}>
              <Text style={styles.deptName}>{g.department}</Text>
              {g.hint ? <Text style={styles.deptHint}>{g.hint}</Text> : null}
            </View>
            {g.tests.map((t, ti) => (
              <View key={ti} style={styles.testRow} wrap={false}>
                <View style={styles.checkbox} />
                <View style={styles.testBody}>
                  <Text style={styles.testName}>{t.name}</Text>
                  {t.sub ? <Text style={styles.testSub}>{t.sub}</Text> : null}
                  <View style={styles.staffLine}>
                    <View style={styles.staffCell}>
                      <Text style={styles.staffLabel}>Sample / time</Text>
                      <View style={styles.rule} />
                    </View>
                    <View style={styles.staffCell}>
                      <Text style={styles.staffLabel}>Initials</Text>
                      <View style={styles.rule} />
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ))}

        {/* Front-desk verification + patient acknowledgement */}
        <View style={styles.verifyBlock} wrap={false}>
          <View style={styles.verifyCol}>
            <Text style={styles.verifyLabel}>Tests verified at front desk by</Text>
            {props.verifiedBy ? <Text style={styles.verifyValue}>{props.verifiedBy}</Text> : <View style={styles.verifyLine} />}
          </View>
          <View style={styles.verifyCol}>
            <Text style={styles.verifyLabel}>Patient signature</Text>
            <View style={styles.verifyLine} />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{props.labName} · Patient visit checklist</Text>
          <Text style={styles.footerText}>Powered by Poveon</Text>
        </View>
      </Page>
    </Document>
  );
}
