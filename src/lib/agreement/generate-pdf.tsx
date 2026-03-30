import React from "react";
import {
  Document, Page, Text, View, StyleSheet, Image, Font,
} from "@react-pdf/renderer";
import { buildAgreementSections, AGREEMENT_VERSION } from "./content";

// Use built-in Helvetica family — no font download needed
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: "#1a1a2e",
    paddingTop: 54,
    paddingBottom: 64,
    paddingHorizontal: 56,
    lineHeight: 1.55,
  },

  // ── Cover page ──────────────────────────────────────────────────────────────
  coverPage: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a2e",
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    display: "flex",
    flexDirection: "column",
  },
  coverAccent: {
    backgroundColor: "#0f172a",
    paddingTop: 64,
    paddingBottom: 48,
    paddingHorizontal: 56,
  },
  coverLogo: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  coverLogoAccent: {
    color: "#38bdf8",
  },
  coverTagline: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 4,
    letterSpacing: 0.3,
  },
  coverBody: {
    flex: 1,
    paddingTop: 64,
    paddingBottom: 48,
    paddingHorizontal: 56,
  },
  coverDivider: {
    width: 48,
    height: 3,
    backgroundColor: "#38bdf8",
    marginBottom: 28,
    borderRadius: 2,
  },
  coverTitle: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    lineHeight: 1.2,
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 40,
  },
  coverMetaRow: {
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "flex-start",
  },
  coverMetaLabel: {
    fontSize: 8.5,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    width: 110,
    marginTop: 1,
  },
  coverMetaValue: {
    fontSize: 10,
    color: "#1e293b",
    fontFamily: "Helvetica-Bold",
    flex: 1,
  },
  coverFooter: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 20,
    paddingHorizontal: 56,
    paddingBottom: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  coverFooterText: {
    fontSize: 8,
    color: "#94a3b8",
  },

  // ── Header / footer ─────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 0.75,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 8,
    marginBottom: 20,
  },
  headerBrand: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  headerBrandAccent: {
    color: "#0ea5e9",
  },
  headerRight: {
    fontSize: 7.5,
    color: "#94a3b8",
    textAlign: "right",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: "#94a3b8",
  },

  // ── Section & clause ────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginTop: 16,
    marginBottom: 6,
  },
  clause: {
    marginBottom: 7,
    textAlign: "justify" as const,
    fontSize: 9.5,
    color: "#334155",
  },

  // ── Signature certificate page ───────────────────────────────────────────────
  certPage: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: "#1a1a2e",
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    display: "flex",
    flexDirection: "column",
  },
  certHeader: {
    backgroundColor: "#0f172a",
    paddingTop: 32,
    paddingBottom: 24,
    paddingHorizontal: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  certHeaderBrand: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  certHeaderTitle: {
    fontSize: 9,
    color: "#94a3b8",
    textAlign: "right",
  },
  certBody: {
    flex: 1,
    paddingHorizontal: 56,
    paddingTop: 40,
    paddingBottom: 48,
  },
  certTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 4,
  },
  certSubtitle: {
    fontSize: 9.5,
    color: "#64748b",
    marginBottom: 28,
  },
  certCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  certCardTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  certRow: {
    flexDirection: "row",
    marginBottom: 8,
    alignItems: "flex-start",
  },
  certLabel: {
    fontSize: 8.5,
    color: "#64748b",
    width: 130,
    flexShrink: 0,
  },
  certValue: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    flex: 1,
  },
  certDivider: {
    borderTopWidth: 0.75,
    borderTopColor: "#e2e8f0",
    marginVertical: 16,
  },
  sigSection: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 18,
  },
  sigBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 16,
    backgroundColor: "#ffffff",
  },
  sigLabel: {
    fontSize: 7.5,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  sigImage: {
    height: 60,
    objectFit: "contain" as const,
    marginBottom: 8,
  },
  sigName: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    paddingTop: 6,
    marginTop: 2,
  },
  sigTitle: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  hashBox: {
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    padding: 10,
    marginTop: 4,
  },
  hashLabel: {
    fontSize: 7.5,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  hashValue: {
    fontSize: 7,
    fontFamily: "Helvetica",
    color: "#475569",
    letterSpacing: 0.2,
  },
  legalNote: {
    fontSize: 7.5,
    color: "#64748b",
    lineHeight: 1.5,
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 12,
    marginTop: 4,
  },
});

function PageHeader({ refNo }: { refNo: string }) {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.headerBrand}>
        Poveon<Text style={styles.headerBrandAccent}> Health</Text>
      </Text>
      <Text style={styles.headerRight}>
        {"Laboratory Partnership Agreement\n"}
        {refNo}
      </Text>
    </View>
  );
}

function PageFooter({ labName, signedAt }: { labName: string; signedAt: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{labName} · Confidential</Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
      <Text style={styles.footerText}>Signed {signedAt}</Text>
    </View>
  );
}

export interface AgreementPdfProps {
  labName: string;
  labAddress: string;
  signerName: string;
  signerEmail: string;
  signerTitle?: string;
  signedAt: string; // formatted date string
  ipAddress?: string;
  userAgent?: string;
  signatureDataUrl?: string; // base64 PNG from canvas
  referenceNumber: string;
  pdfHash?: string; // filled after generation — placeholder on first render
  customContent?: string; // admin-edited plain text; overrides default sections
  previewOnly?: boolean; // when true, omit the signature certificate page
}

export function AgreementPdf({
  labName,
  labAddress,
  signerName,
  signerEmail,
  signerTitle,
  signedAt,
  ipAddress,
  userAgent,
  signatureDataUrl,
  referenceNumber,
  pdfHash = "— computed after signing —",
  customContent,
  previewOnly = false,
}: AgreementPdfProps) {
  const sections = customContent ? null : buildAgreementSections(labName);
  // When custom content is provided, split into paragraphs on blank lines
  const customParagraphs = customContent
    ? customContent.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    : null;

  return (
    <Document
      title="Poveon Laboratory Partnership Agreement"
      author="Poveon Ltd"
      subject={`Partnership Agreement — ${labName}`}
      creator="Poveon Platform"
    >
      {/* ── Cover Page ─────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverAccent}>
          <Text style={styles.coverLogo}>
            Poveon<Text style={styles.coverLogoAccent}> Ltd</Text>
          </Text>
          <Text style={styles.coverTagline}>Digital Health Platform · Nigeria</Text>
        </View>

        <View style={styles.coverBody}>
          <View style={styles.coverDivider} />
          <Text style={styles.coverTitle}>Laboratory{"\n"}Partnership Agreement</Text>
          <Text style={styles.coverSubtitle}>Digitally executed via the Poveon Platform</Text>

          <View style={styles.coverMetaRow}>
            <Text style={styles.coverMetaLabel}>Laboratory</Text>
            <Text style={styles.coverMetaValue}>{labName}</Text>
          </View>
          <View style={styles.coverMetaRow}>
            <Text style={styles.coverMetaLabel}>Address</Text>
            <Text style={styles.coverMetaValue}>{labAddress || "As registered on the platform"}</Text>
          </View>
          <View style={styles.coverMetaRow}>
            <Text style={styles.coverMetaLabel}>Signed by</Text>
            <Text style={styles.coverMetaValue}>{signerName}{signerTitle ? ` · ${signerTitle}` : ""}</Text>
          </View>
          <View style={styles.coverMetaRow}>
            <Text style={styles.coverMetaLabel}>Date of signing</Text>
            <Text style={styles.coverMetaValue}>{signedAt}</Text>
          </View>
          <View style={styles.coverMetaRow}>
            <Text style={styles.coverMetaLabel}>Agreement version</Text>
            <Text style={styles.coverMetaValue}>{AGREEMENT_VERSION}</Text>
          </View>
          <View style={styles.coverMetaRow}>
            <Text style={styles.coverMetaLabel}>Reference</Text>
            <Text style={styles.coverMetaValue}>{referenceNumber}</Text>
          </View>
        </View>

        <View style={styles.coverFooter}>
          <Text style={styles.coverFooterText}>CONFIDENTIAL — For authorised parties only</Text>
          <Text style={styles.coverFooterText}>Effective Date of Execution</Text>
        </View>
      </Page>

      {/* ── Agreement Terms Pages ──────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <PageHeader refNo={referenceNumber} />

        {/* Preamble */}
        <View style={{ marginBottom: 8 }}>
          <Text style={[styles.clause, { color: "#64748b", fontFamily: "Helvetica-Oblique", fontSize: 9 }]}>
            This Laboratory Partnership Agreement (Version {AGREEMENT_VERSION}) is entered into between
            Poveon Ltd and {labName}. By digitally signing this document, both parties
            agree to be legally bound by the terms set forth below under the laws of the Federal
            Republic of Nigeria.
          </Text>
        </View>

        {customParagraphs
          ? customParagraphs.map((para, i) => {
              // Lines starting with a digit+dot or all-caps look like headings
              const isHeading = /^(\d+\.|\d+\s)/.test(para) && para.length < 80;
              return isHeading ? (
                <Text key={i} style={styles.sectionTitle}>{para}</Text>
              ) : (
                <Text key={i} style={styles.clause}>{para}</Text>
              );
            })
          : sections!.map((section) => (
              <View key={section.title} wrap={false}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.clauses.map((clause, i) => (
                  <Text key={i} style={styles.clause}>
                    {clause}
                  </Text>
                ))}
              </View>
            ))}

        <PageFooter labName={labName} signedAt={signedAt} />
      </Page>

      {/* ── Signature Certificate Page ─────────────────────────────────────── */}
      {!previewOnly && <Page size="A4" style={styles.certPage}>
        <View style={styles.certHeader}>
          <Text style={styles.certHeaderBrand}>Poveon</Text>
          <Text style={styles.certHeaderTitle}>
            {"Electronic Signature Certificate\n"}
            {referenceNumber}
          </Text>
        </View>

        <View style={styles.certBody}>
          <Text style={styles.certTitle}>Signature Certificate</Text>
          <Text style={styles.certSubtitle}>
            This certificate confirms the details of the electronic signature applied to this agreement.
          </Text>

          {/* Signer info */}
          <View style={styles.certCard}>
            <Text style={styles.certCardTitle}>Signer Information</Text>
            <View style={styles.certRow}>
              <Text style={styles.certLabel}>Full Name</Text>
              <Text style={styles.certValue}>{signerName}</Text>
            </View>
            {signerTitle && (
              <View style={styles.certRow}>
                <Text style={styles.certLabel}>Title / Role</Text>
                <Text style={styles.certValue}>{signerTitle}</Text>
              </View>
            )}
            <View style={styles.certRow}>
              <Text style={styles.certLabel}>Email Address</Text>
              <Text style={styles.certValue}>{signerEmail}</Text>
            </View>
            <View style={styles.certRow}>
              <Text style={styles.certLabel}>Organisation</Text>
              <Text style={styles.certValue}>{labName}</Text>
            </View>
          </View>

          {/* Signing event */}
          <View style={styles.certCard}>
            <Text style={styles.certCardTitle}>Signing Event</Text>
            <View style={styles.certRow}>
              <Text style={styles.certLabel}>Date &amp; Time (UTC)</Text>
              <Text style={styles.certValue}>{signedAt}</Text>
            </View>
            <View style={styles.certRow}>
              <Text style={styles.certLabel}>IP Address</Text>
              <Text style={styles.certValue}>{ipAddress || "Not recorded"}</Text>
            </View>
            <View style={styles.certRow}>
              <Text style={styles.certLabel}>Agreement Version</Text>
              <Text style={styles.certValue}>{AGREEMENT_VERSION}</Text>
            </View>
            <View style={styles.certRow}>
              <Text style={styles.certLabel}>Reference Number</Text>
              <Text style={styles.certValue}>{referenceNumber}</Text>
            </View>
            {userAgent && (
              <View style={styles.certRow}>
                <Text style={styles.certLabel}>Browser / Device</Text>
                <Text style={[styles.certValue, { fontSize: 7.5 }]}>{userAgent.slice(0, 100)}</Text>
              </View>
            )}
          </View>

          {/* Drawn signature */}
          <View style={styles.sigSection}>
            <View style={styles.sigBox}>
              <Text style={styles.sigLabel}>Authorised Signature</Text>
              {signatureDataUrl ? (
                <Image src={signatureDataUrl} style={styles.sigImage} />
              ) : (
                <View style={{ height: 60, justifyContent: "center" }}>
                  <Text style={{ fontSize: 8, color: "#94a3b8", fontFamily: "Helvetica-Oblique" }}>
                    [Signature on file]
                  </Text>
                </View>
              )}
              <Text style={styles.sigName}>{signerName}</Text>
              {signerTitle && <Text style={styles.sigTitle}>{signerTitle} · {labName}</Text>}
            </View>
            <View style={styles.sigBox}>
              <Text style={styles.sigLabel}>On Behalf Of</Text>
              <View style={{ height: 60, justifyContent: "center" }}>
                <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0f172a" }}>
                  Poveon
                </Text>
                <Text style={{ fontSize: 8, color: "#64748b", marginTop: 4 }}>Ltd, Nigeria</Text>
              </View>
              <Text style={styles.sigName}>Platform Authorised</Text>
              <Text style={styles.sigTitle}>Digital Processing System</Text>
            </View>
          </View>

          {/* Document hash */}
          <View style={styles.hashBox}>
            <Text style={styles.hashLabel}>Document Integrity Hash (SHA-256)</Text>
            <Text style={styles.hashValue}>{pdfHash}</Text>
          </View>

          <View style={styles.certDivider} />

          <Text style={styles.legalNote}>
            This electronic signature was applied via the Poveon digital onboarding platform.
            The signer affirmed their identity, confirmed they had read the full agreement, and
            provided their signature with clear intent to be legally bound. This document constitutes
            a valid electronic signature in accordance with the Nigeria Evidence Act 2011 (Sections 84
            &amp; 93) and is legally enforceable under the laws of the Federal Republic of Nigeria.
            Any alteration of this document after signing can be detected by recomputing the
            SHA-256 hash above.
          </Text>
        </View>
      </Page>}
    </Document>
  );
}
