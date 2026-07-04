import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

/**
 * Branded "Patient Visit Checklist" — the hand-off slip a client takes around
 * the laboratory after the front desk has verified their tests. Lists patient
 * details, the referring doctor, and every requested test as a tick-box
 * checklist grouped by the department that performs it. Built on the same
 * Helvetica/no-font-download approach as the result and agreement PDFs.
 */
const BLUE = "#0259a0";
const INK = "#0f172a";
const SLATE = "#64748b";
const LIGHT = "#94a3b8";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1a1a2e", paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, lineHeight: 1.4 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: BLUE, paddingBottom: 10, marginBottom: 4 },
  brandRow: { flexDirection: "row", alignItems: "center", maxWidth: "62%" },
  logo: { width: 42, height: 42, marginRight: 10, objectFit: "contain" },
  labName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: INK },
  labMeta: { fontSize: 7.5, color: SLATE, marginTop: 2, maxWidth: 240 },
  metaRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 1 },
  codeText: { fontSize: 13, fontFamily: "Helvetica-Bold", color: BLUE, letterSpacing: 1, marginTop: 2 },
  metaDate: { fontSize: 8, color: SLATE, marginTop: 2 },

  accent: { height: 3, backgroundColor: "#059669", borderRadius: 2, marginBottom: 12 },

  twoCol: { flexDirection: "row", gap: 10, marginBottom: 12 },
  card: { flex: 1, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 10 },
  sectionLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: LIGHT, textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 5 },
  field: { flexDirection: "row", marginBottom: 3 },
  fieldLabel: { fontSize: 8.5, color: SLATE, width: 58 },
  fieldValue: { fontSize: 9.5, color: INK, fontFamily: "Helvetica-Bold", flex: 1 },

  noteCard: { backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 10, marginBottom: 12 },
  noteText: { fontSize: 9.5, color: INK, lineHeight: 1.5 },

  instruction: { flexDirection: "row", backgroundColor: "#f0f7ff", borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 6, padding: 8, marginBottom: 14 },
  instructionText: { fontSize: 8.5, color: "#1e3a5f", lineHeight: 1.5, flex: 1 },

  deptHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#eef5fb", borderLeftWidth: 3, borderLeftColor: BLUE, paddingVertical: 5, paddingHorizontal: 8, marginTop: 8, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  deptName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BLUE },
  deptHint: { fontSize: 8, color: SLATE },

  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingVertical: 4, paddingHorizontal: 8 },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 0.5 },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: "#eef2f7" },
  cBox: { width: "8%" }, cTest: { width: "50%" }, cDone: { width: "21%" }, cStaff: { width: "21%" },
  checkbox: { width: 11, height: 11, borderWidth: 1, borderColor: "#64748b", borderRadius: 2 },
  testName: { fontSize: 9.5, color: INK, fontFamily: "Helvetica-Bold" },
  testSub: { fontSize: 7.5, color: LIGHT },
  ruleLine: { borderBottomWidth: 1, borderBottomColor: "#cbd5e1", height: 1, marginTop: 8 },

  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4, marginBottom: 4 },
  chip: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, paddingVertical: 2, paddingHorizontal: 7, backgroundColor: "#ffffff" },
  chipText: { fontSize: 8, color: INK, fontFamily: "Helvetica-Bold" },

  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  totalLabel: { fontSize: 9, color: SLATE },
  totalValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK },

  verifyBlock: { marginTop: 16, flexDirection: "row", gap: 16 },
  verifyCol: { flex: 1 },
  verifyLabel: { fontSize: 7.5, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.8 },
  verifyLine: { borderBottomWidth: 1, borderBottomColor: "#94a3b8", height: 16, marginTop: 2 },
  verifyValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK, marginTop: 2 },

  footer: { position: "absolute", bottom: 26, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 7 },
  footerText: { fontSize: 7, color: LIGHT },
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
  totalLabel?: string | null;     // e.g. "₦12,000" — omit when no pricing
  verifiedBy?: string | null;
};

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value && value.trim() ? value : "—"}</Text>
    </View>
  );
}

export function VisitChecklistPdf(props: VisitChecklistProps) {
  const dateStr = props.generatedAt.toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const departmentNames = props.groups.map((g) => g.department);

  return (
    <Document title={`Visit checklist ${props.code}`} author={props.labName}>
      <Page size="A4" style={styles.page}>
        {/* Header — logo + lab identity, code + date */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            {props.labLogo ? <Image style={styles.logo} src={props.labLogo} /> : null}
            <View>
              <Text style={styles.labName}>{props.labName}</Text>
              {(props.labAddress || props.labPhones) ? (
                <Text style={styles.labMeta}>{[props.labAddress, props.labPhones].filter(Boolean).join("  ·  ")}</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.docTitle}>Patient Visit Checklist</Text>
            <Text style={styles.codeText}>{props.code}</Text>
            <Text style={styles.metaDate}>{dateStr}</Text>
          </View>
        </View>
        <View style={styles.accent} />

        {/* Patient + referral */}
        <View style={styles.twoCol}>
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Patient</Text>
            <Row label="Name" value={props.patientName} />
            <Row label="Age / Sex" value={[props.patientAge != null ? `${props.patientAge} yrs` : null, props.patientSex].filter(Boolean).join("  ·  ") || null} />
            <Row label="Phone" value={props.patientPhone} />
            <Row label="Email" value={props.patientEmail} />
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Referral</Text>
            <Row label="Doctor" value={props.doctorName} />
            <Row label="Hospital" value={props.doctorHospital} />
            <Row label="Phone" value={props.doctorPhone} />
            <Row label="Email" value={props.doctorEmail} />
            <Row label="Request" value={props.code} />
          </View>
        </View>

        {/* The request as the doctor wrote it + clinical details */}
        {(props.rawText || props.diagnosis) ? (
          <View style={styles.noteCard}>
            <Text style={styles.sectionLabel}>Doctor&apos;s request</Text>
            {props.rawText ? <Text style={styles.noteText}>&ldquo;{props.rawText}&rdquo;</Text> : null}
            {props.diagnosis ? (
              <View style={[styles.field, { marginTop: props.rawText ? 4 : 0 }]}>
                <Text style={styles.fieldLabel}>Clinical</Text>
                <Text style={styles.fieldValue}>{props.diagnosis}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Departments to visit + instruction */}
        {departmentNames.length > 0 ? (
          <View style={styles.summaryRow}>
            {departmentNames.map((d, i) => (
              <View key={i} style={styles.chip}><Text style={styles.chipText}>{d}</Text></View>
            ))}
          </View>
        ) : null}
        <View style={styles.instruction}>
          <Text style={styles.instructionText}>
            Please present this slip at each department below. A staff member will tick each test, write their initials and the time as it is completed. Keep this copy until all tests are done.
          </Text>
        </View>

        {/* Test checklist grouped by department */}
        {props.groups.map((g, gi) => (
          <View key={gi} wrap={false}>
            <View style={styles.deptHeading}>
              <Text style={styles.deptName}>{g.department}</Text>
              <Text style={styles.deptHint}>{g.hint}</Text>
            </View>
            <View style={styles.thead}>
              <Text style={[styles.th, styles.cBox]}>Done</Text>
              <Text style={[styles.th, styles.cTest]}>Test</Text>
              <Text style={[styles.th, styles.cDone]}>Sample / Time</Text>
              <Text style={[styles.th, styles.cStaff]}>Staff initials</Text>
            </View>
            {g.tests.map((t, ti) => (
              <View key={ti} style={styles.tr}>
                <View style={styles.cBox}><View style={styles.checkbox} /></View>
                <View style={styles.cTest}>
                  <Text style={styles.testName}>{t.name}</Text>
                  {t.sub ? <Text style={styles.testSub}>{t.sub}</Text> : null}
                </View>
                <View style={styles.cDone}><View style={styles.ruleLine} /></View>
                <View style={styles.cStaff}><View style={styles.ruleLine} /></View>
              </View>
            ))}
          </View>
        ))}

        {props.totalLabel ? (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Amount paid at front desk</Text>
            <Text style={styles.totalValue}>{props.totalLabel}</Text>
          </View>
        ) : null}

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

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{props.labName} · Patient visit checklist · Powered by Poveon</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
