import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// Uses built-in Helvetica family — no font download needed (same as agreement PDF)
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a2e",
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 54,
    lineHeight: 1.55,
  },
  letterheadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: "#0f172a",
    paddingBottom: 12,
    marginBottom: 16,
  },
  fromName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  letterTitle: { fontSize: 9, color: "#64748b", marginTop: 2, letterSpacing: 0.5 },
  metaRight: { alignItems: "flex-end" },
  metaDate: { fontSize: 9, color: "#64748b" },
  codeBox: {
    marginTop: 4,
    backgroundColor: "#f0f7ff",
    borderWidth: 1,
    borderColor: "#0270c3",
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  codeText: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0259a0", letterSpacing: 1 },
  urgencyBadge: {
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  sectionLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  block: { marginBottom: 14 },
  toLine: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  bodyText: { fontSize: 10, color: "#1e293b" },
  patientCard: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 10,
    marginBottom: 14,
  },
  patientRow: { flexDirection: "row", flexWrap: "wrap" },
  patientField: { width: "33.33%", marginBottom: 6, paddingRight: 8 },
  fieldLabel: { fontSize: 7, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 },
  fieldValue: { fontSize: 10, color: "#0f172a", fontFamily: "Helvetica-Bold", marginTop: 1 },
  note: { fontSize: 10.5, color: "#1e293b", lineHeight: 1.7 },
  signatureBlock: { marginTop: 22, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 54,
    right: 54,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
  },
  footerText: { fontSize: 7.5, color: "#94a3b8" },
});

const URGENCY_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  emergency: { bg: "#fee2e2", color: "#dc2626", label: "EMERGENCY" },
  urgent: { bg: "#fef3c7", color: "#b45309", label: "URGENT" },
  routine: { bg: "#f1f5f9", color: "#64748b", label: "ROUTINE" },
};

export type ReferralPdfProps = {
  code: string;
  status: string;
  created_at: Date;
  urgency: string;
  specialty: string;
  from_hospital: string;
  to_hospital_name: string;
  to_hospital_address?: string | null;
  to_hospital_city?: string | null;
  to_hospital_state?: string | null;
  patient_name: string;
  patient_age?: number | null;
  patient_sex?: string | null;
  patient_phone: string;
  patient_email?: string | null;
  hospital_number?: string | null;
  doctor_name: string;
  doctor_email: string;
  doctor_phone?: string | null;
  provisional_diagnosis?: string | null;
  clinical_note: string;
};

export function ReferralPdf(props: ReferralPdfProps) {
  const u = URGENCY_STYLES[props.urgency] ?? URGENCY_STYLES.routine;
  const dateStr = props.created_at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const toLocation = [props.to_hospital_city, props.to_hospital_state].filter(Boolean).join(", ");

  return (
    <Document title={`Referral ${props.code}`} author="Poveon Referral Network">
      <Page size="A4" style={styles.page}>
        {/* Letterhead */}
        <View style={styles.letterheadRow}>
          <View>
            <Text style={styles.fromName}>{props.from_hospital}</Text>
            <Text style={styles.letterTitle}>PATIENT REFERRAL LETTER</Text>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.metaDate}>{dateStr}</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{props.code}</Text>
            </View>
            <Text style={[styles.urgencyBadge, { backgroundColor: u.bg, color: u.color }]}>{u.label}</Text>
          </View>
        </View>

        {/* To */}
        <View style={styles.block}>
          <Text style={styles.sectionLabel}>To</Text>
          <Text style={styles.toLine}>{props.specialty} Department</Text>
          <Text style={styles.bodyText}>{props.to_hospital_name}</Text>
          {props.to_hospital_address ? <Text style={styles.bodyText}>{props.to_hospital_address}</Text> : null}
          {toLocation ? <Text style={styles.bodyText}>{toLocation}</Text> : null}
        </View>

        {/* Patient */}
        <View style={styles.patientCard}>
          <Text style={styles.sectionLabel}>Patient Details</Text>
          <View style={styles.patientRow}>
            <View style={styles.patientField}>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <Text style={styles.fieldValue}>{props.patient_name}</Text>
            </View>
            <View style={styles.patientField}>
              <Text style={styles.fieldLabel}>Age</Text>
              <Text style={styles.fieldValue}>{props.patient_age != null ? `${props.patient_age} years` : "—"}</Text>
            </View>
            <View style={styles.patientField}>
              <Text style={styles.fieldLabel}>Sex</Text>
              <Text style={styles.fieldValue}>{props.patient_sex ?? "—"}</Text>
            </View>
            <View style={styles.patientField}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <Text style={styles.fieldValue}>{props.patient_phone}</Text>
            </View>
            <View style={styles.patientField}>
              <Text style={styles.fieldLabel}>Email</Text>
              <Text style={styles.fieldValue}>{props.patient_email ?? "—"}</Text>
            </View>
            <View style={styles.patientField}>
              <Text style={styles.fieldLabel}>Hospital No.</Text>
              <Text style={styles.fieldValue}>{props.hospital_number ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* Diagnosis */}
        {props.provisional_diagnosis ? (
          <View style={styles.block}>
            <Text style={styles.sectionLabel}>Provisional Diagnosis</Text>
            <Text style={[styles.bodyText, { fontFamily: "Helvetica-Bold" }]}>{props.provisional_diagnosis}</Text>
          </View>
        ) : null}

        {/* Clinical note */}
        <View style={styles.block}>
          <Text style={styles.sectionLabel}>Clinical Note</Text>
          <Text style={styles.note}>{props.clinical_note}</Text>
        </View>

        {/* Referring doctor */}
        <View style={styles.signatureBlock} wrap={false}>
          <Text style={styles.sectionLabel}>Referring Doctor</Text>
          <Text style={[styles.bodyText, { fontFamily: "Helvetica-Bold", fontSize: 11 }]}>{props.doctor_name}</Text>
          <Text style={styles.bodyText}>{props.from_hospital}</Text>
          <Text style={styles.bodyText}>{props.doctor_email}{props.doctor_phone ? `  ·  ${props.doctor_phone}` : ""}</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Poveon Referral Network — verify status at poveon.com/refer/track/{props.code}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
