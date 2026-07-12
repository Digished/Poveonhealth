import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

const ACCENT = "#0259a0";
const INK = "#0f172a";
const MUTED = "#64748b";
const FAINT = "#94a3b8";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1e293b", paddingTop: 36, paddingBottom: 60, paddingHorizontal: 44, lineHeight: 1.5 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: "62%" },
  logo: { width: 46, height: 46, objectFit: "contain", borderRadius: 4 },
  labName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: INK },
  labMeta: { fontSize: 8, color: MUTED, marginTop: 1 },
  metaRight: { alignItems: "flex-end" },
  reportKicker: { fontSize: 8, fontFamily: "Helvetica-Bold", color: ACCENT, letterSpacing: 1.5, textTransform: "uppercase" },
  metaDate: { fontSize: 9, color: MUTED, marginTop: 3 },
  codeText: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 1, marginTop: 1 },
  accentBar: { height: 3, backgroundColor: ACCENT, borderRadius: 2, marginTop: 10, marginBottom: 14 },
  sectionLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: FAINT, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 },
  patientCard: { backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 12, marginBottom: 16 },
  patientRow: { flexDirection: "row", flexWrap: "wrap" },
  patientField: { width: "25%", marginBottom: 4, paddingRight: 8 },
  fieldLabel: { fontSize: 7, color: FAINT, textTransform: "uppercase", letterSpacing: 0.8 },
  fieldValue: { fontSize: 10, color: INK, fontFamily: "Helvetica-Bold", marginTop: 1 },
  reportTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: ACCENT, marginTop: 6, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  groupHeading: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK, marginTop: 10, marginBottom: 4 },
  thead: { flexDirection: "row", backgroundColor: "#f1f5f9", paddingVertical: 5, paddingHorizontal: 6, borderRadius: 3 },
  tr: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: "#eef2f7" },
  trAlt: { backgroundColor: "#fbfcfe" },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  cParam: { width: "34%" }, cResult: { width: "18%" }, cUnit: { width: "14%" }, cRange: { width: "26%" }, cFlag: { width: "8%" },
  cell: { fontSize: 9.5, color: "#1e293b" },
  resultVal: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK },
  flagH: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#dc2626" },
  flagL: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#b45309" },
  narrativeBlock: { marginTop: 8 },
  narrativeLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: ACCENT, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  narrativeText: { fontSize: 10, color: "#1e293b", lineHeight: 1.55 },
  commentBox: { marginTop: 12, backgroundColor: "#f0f7ff", borderLeftWidth: 3, borderLeftColor: ACCENT, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10 },
  commentText: { fontSize: 9.5, color: "#1e293b", lineHeight: 1.6 },
  aboutBox: { marginTop: 10, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10 },
  aboutText: { fontSize: 9, color: MUTED, lineHeight: 1.55 },
  signatureBlock: { marginTop: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e2e8f0", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  sigName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK },
  footer: { position: "absolute", bottom: 26, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 8 },
  footerText: { fontSize: 7.5, color: FAINT },
});

export type ResultParam = { name: string; value?: string; unit?: string; reference_range?: string; flag?: string; group?: string };

export type ResultSection = {
  title?: string | null; // template / department name
  parameters: ResultParam[];
  comment?: string | null;
  about?: string | null; // plain-English "about this test" note
  verifiedBy?: string | null;
  verifiedAt?: Date | null;
};

export type ResultReportProps = {
  labName: string;
  labLogo?: string | null; // data URI or URL
  labAddress?: string | null;
  labPhone?: string | null;
  labEmail?: string | null;
  code: string;
  reportedAt: Date;
  patientName?: string | null;
  patientAge?: number | null;
  patientSex?: string | null;
  patientPhone?: string | null;
  sections: ResultSection[];
};

function FlagText({ flag }: { flag?: string }) {
  if (flag === "H" || flag === "HH") return <Text style={styles.flagH}>High</Text>;
  if (flag === "L" || flag === "LL") return <Text style={styles.flagL}>Low</Text>;
  return <Text style={styles.cell}>—</Text>;
}

/** A parameter is "narrative" (a free-text report field) when it carries no unit and no reference range. */
function isNarrative(p: ResultParam): boolean {
  return !p.unit?.trim() && !p.reference_range?.trim();
}

function SectionBody({ section }: { section: ResultSection }) {
  const tabular = section.parameters.filter((p) => !isNarrative(p));
  const narrative = section.parameters.filter(isNarrative);

  // Group the tabular params by their optional group.
  const groups = new Map<string, ResultParam[]>();
  for (const p of tabular) {
    const g = p.group?.trim() || "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }

  return (
    <View>
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
            <View key={i} style={[styles.tr, ...(i % 2 ? [styles.trAlt] : [])]}>
              <Text style={[styles.cell, styles.cParam]}>{p.name}</Text>
              <Text style={[styles.resultVal, styles.cResult]}>{p.value || "—"}</Text>
              <Text style={[styles.cell, styles.cUnit]}>{p.unit || "—"}</Text>
              <Text style={[styles.cell, styles.cRange]}>{p.reference_range || "—"}</Text>
              <View style={styles.cFlag}><FlagText flag={p.flag} /></View>
            </View>
          ))}
        </View>
      ))}

      {narrative.map((p, i) => (
        <View key={i} style={styles.narrativeBlock} wrap={false}>
          <Text style={styles.narrativeLabel}>{p.name}</Text>
          <Text style={styles.narrativeText}>{p.value || "—"}</Text>
        </View>
      ))}

      {section.comment ? (
        <View style={styles.commentBox}>
          <Text style={styles.sectionLabel}>Comment</Text>
          <Text style={styles.commentText}>{section.comment}</Text>
        </View>
      ) : null}

      {section.about ? (
        <View style={styles.aboutBox} wrap={false}>
          <Text style={styles.sectionLabel}>About this test</Text>
          <Text style={styles.aboutText}>{section.about}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ResultReportPdf(props: ResultReportProps) {
  const dateStr = props.reportedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const multi = props.sections.length > 1;
  // Verification line: use the last verified section (or the first with data).
  const verifier = [...props.sections].reverse().find((s) => s.verifiedBy)?.verifiedBy ?? null;
  const verifiedAt = [...props.sections].reverse().find((s) => s.verifiedAt)?.verifiedAt ?? null;

  return (
    <Document title={`Result ${props.code}`} author={props.labName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            {props.labLogo ? <Image style={styles.logo} src={props.labLogo} /> : null}
            <View>
              <Text style={styles.labName}>{props.labName}</Text>
              {props.labAddress ? <Text style={styles.labMeta}>{props.labAddress}</Text> : null}
              {(props.labPhone || props.labEmail) ? <Text style={styles.labMeta}>{[props.labPhone, props.labEmail].filter(Boolean).join("  ·  ")}</Text> : null}
            </View>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.reportKicker}>Laboratory Report</Text>
            <Text style={styles.metaDate}>{dateStr}</Text>
            <Text style={styles.codeText}>{props.code}</Text>
          </View>
        </View>
        <View style={styles.accentBar} />

        <View style={styles.patientCard}>
          <Text style={styles.sectionLabel}>Patient</Text>
          <View style={styles.patientRow}>
            <View style={styles.patientField}><Text style={styles.fieldLabel}>Name</Text><Text style={styles.fieldValue}>{props.patientName ?? "—"}</Text></View>
            <View style={styles.patientField}><Text style={styles.fieldLabel}>Age</Text><Text style={styles.fieldValue}>{props.patientAge != null ? `${props.patientAge} yrs` : "—"}</Text></View>
            <View style={styles.patientField}><Text style={styles.fieldLabel}>Sex</Text><Text style={styles.fieldValue}>{props.patientSex ?? "—"}</Text></View>
            <View style={styles.patientField}><Text style={styles.fieldLabel}>Phone</Text><Text style={styles.fieldValue}>{props.patientPhone ?? "—"}</Text></View>
          </View>
        </View>

        {props.sections.map((section, si) => (
          <View key={si}>
            {multi && section.title ? <Text style={styles.reportTitle}>{section.title}</Text> : null}
            <SectionBody section={section} />
          </View>
        ))}

        <View style={styles.signatureBlock} wrap={false}>
          <View>
            <Text style={styles.sectionLabel}>Verified by</Text>
            <Text style={styles.sigName}>{verifier || "—"}</Text>
            {verifiedAt ? <Text style={styles.cell}>{verifiedAt.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text> : null}
          </View>
          <Text style={[styles.footerText, { fontStyle: "italic" }]}>This is a computer-generated report.</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{props.labName} · Powered by Poveon</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
