import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// Built-in Helvetica — no font download (same approach as referral/agreement PDFs).
const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1a1a2e", paddingTop: 44, paddingBottom: 56, paddingHorizontal: 48, lineHeight: 1.5 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: "#0f172a", paddingBottom: 10, marginBottom: 14 },
  labName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  reportTitle: { fontSize: 9, color: "#64748b", marginTop: 2, letterSpacing: 0.5, textTransform: "uppercase" },
  metaRight: { alignItems: "flex-end" },
  metaDate: { fontSize: 9, color: "#64748b" },
  codeText: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0259a0", letterSpacing: 1, marginTop: 2 },
  sectionLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 },
  patientCard: { backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 10, marginBottom: 14 },
  patientRow: { flexDirection: "row", flexWrap: "wrap" },
  patientField: { width: "33.33%", marginBottom: 6, paddingRight: 8 },
  fieldLabel: { fontSize: 7, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 },
  fieldValue: { fontSize: 10, color: "#0f172a", fontFamily: "Helvetica-Bold", marginTop: 1 },
  groupHeading: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#0f172a", marginTop: 10, marginBottom: 4 },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingBottom: 4, marginBottom: 2 },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#eef2f7" },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  cParam: { width: "34%" }, cResult: { width: "18%" }, cUnit: { width: "16%" }, cRange: { width: "24%" }, cFlag: { width: "8%" },
  cell: { fontSize: 9.5, color: "#1e293b" },
  resultVal: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  flagH: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#dc2626" },
  flagL: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#b45309" },
  commentBox: { marginTop: 14, backgroundColor: "#f0f7ff", borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 6, padding: 10 },
  commentText: { fontSize: 9.5, color: "#1e293b", lineHeight: 1.6 },
  signatureBlock: { marginTop: 22, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 8 },
  footerText: { fontSize: 7.5, color: "#94a3b8" },
});

export type ResultParam = { name: string; value?: string; unit?: string; reference_range?: string; flag?: string; group?: string };

export type ResultReportProps = {
  labName: string;
  code: string;
  reportedAt: Date;
  department?: string | null;
  templateName?: string | null;
  patientName?: string | null;
  patientAge?: number | null;
  patientSex?: string | null;
  patientPhone?: string | null;
  parameters: ResultParam[];
  comment?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: Date | null;
};

function FlagText({ flag }: { flag?: string }) {
  if (flag === "H") return <Text style={styles.flagH}>High</Text>;
  if (flag === "L") return <Text style={styles.flagL}>Low</Text>;
  return <Text style={styles.cell}>—</Text>;
}

export function ResultReportPdf(props: ResultReportProps) {
  const dateStr = props.reportedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  // Group parameters by their optional group.
  const groups = new Map<string, ResultParam[]>();
  for (const p of props.parameters) {
    const g = p.group?.trim() || "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }

  return (
    <Document title={`Result ${props.code}`} author={props.labName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.labName}>{props.labName}</Text>
            <Text style={styles.reportTitle}>Laboratory Result Report</Text>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.metaDate}>{dateStr}</Text>
            <Text style={styles.codeText}>{props.code}</Text>
            {props.department ? <Text style={styles.metaDate}>{props.department}</Text> : null}
          </View>
        </View>

        <View style={styles.patientCard}>
          <Text style={styles.sectionLabel}>Patient</Text>
          <View style={styles.patientRow}>
            <View style={styles.patientField}><Text style={styles.fieldLabel}>Name</Text><Text style={styles.fieldValue}>{props.patientName ?? "—"}</Text></View>
            <View style={styles.patientField}><Text style={styles.fieldLabel}>Age</Text><Text style={styles.fieldValue}>{props.patientAge != null ? `${props.patientAge} yrs` : "—"}</Text></View>
            <View style={styles.patientField}><Text style={styles.fieldLabel}>Sex</Text><Text style={styles.fieldValue}>{props.patientSex ?? "—"}</Text></View>
            <View style={styles.patientField}><Text style={styles.fieldLabel}>Phone</Text><Text style={styles.fieldValue}>{props.patientPhone ?? "—"}</Text></View>
            {props.templateName ? <View style={styles.patientField}><Text style={styles.fieldLabel}>Report</Text><Text style={styles.fieldValue}>{props.templateName}</Text></View> : null}
          </View>
        </View>

        {Array.from(groups.entries()).map(([group, params], gi) => (
          <View key={gi} wrap={false}>
            {group ? <Text style={styles.groupHeading}>{group}</Text> : null}
            <View style={styles.thead}>
              <Text style={[styles.th, styles.cParam]}>Parameter</Text>
              <Text style={[styles.th, styles.cResult]}>Result</Text>
              <Text style={[styles.th, styles.cUnit]}>Unit</Text>
              <Text style={[styles.th, styles.cRange]}>Reference range</Text>
              <Text style={[styles.th, styles.cFlag]}>Flag</Text>
            </View>
            {params.map((p, i) => (
              <View key={i} style={styles.tr}>
                <Text style={[styles.cell, styles.cParam]}>{p.name}</Text>
                <Text style={[styles.resultVal, styles.cResult]}>{p.value || "—"}</Text>
                <Text style={[styles.cell, styles.cUnit]}>{p.unit || "—"}</Text>
                <Text style={[styles.cell, styles.cRange]}>{p.reference_range || "—"}</Text>
                <View style={styles.cFlag}><FlagText flag={p.flag} /></View>
              </View>
            ))}
          </View>
        ))}

        {props.comment ? (
          <View style={styles.commentBox}>
            <Text style={styles.sectionLabel}>Comment</Text>
            <Text style={styles.commentText}>{props.comment}</Text>
          </View>
        ) : null}

        <View style={styles.signatureBlock} wrap={false}>
          <Text style={styles.sectionLabel}>Verified by</Text>
          <Text style={[styles.cell, { fontFamily: "Helvetica-Bold", fontSize: 11 }]}>{props.verifiedBy || "—"}</Text>
          {props.verifiedAt ? <Text style={styles.cell}>{props.verifiedAt.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text> : null}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{props.labName} · Powered by Poveon</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
