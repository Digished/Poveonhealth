import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

/**
 * The A4 flyer a lab or pharmacy prints and puts on the counter.
 *
 * Note: the built-in Helvetica has no em dash. react-pdf drops missing glyphs
 * silently, so an em dash here becomes a gap in the sentence — use hyphens.
 *
 * Everything on it comes from the live settings - the price, both discounts,
 * the message allowance - so changing the price in the admin dashboard changes
 * every poster printed from that moment on. Nothing is baked in.
 *
 * Built on the same Helvetica-only approach as the other PDFs here, so it
 * renders without downloading a font.
 */

export type PromoData = {
  partnerName: string;
  partnerKind: "lab" | "pharmacy";
  addressLine: string | null;
  phone: string | null;
  /** A PNG data URI of the partner's sign-up QR code. */
  qrDataUri: string;
  joinUrl: string;
  priceNaira: number;
  labDiscountPercent: number;
  pharmacyDiscountPercent: number;
  messageAllowance: number;
};

const naira = (n: number) => `NGN ${Math.round(n).toLocaleString("en-NG")}`;

const BRAND = "#0270c3";
const BRAND_DARK = "#0259a0";
const INK = "#0f172a";
const MUTED = "#64748b";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 11,
    color: INK,
    paddingTop: 0,
    paddingBottom: 36,
    paddingHorizontal: 0,
  },
  banner: {
    backgroundColor: BRAND_DARK,
    paddingVertical: 26,
    paddingHorizontal: 44,
  },
  brandRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#ffffff", letterSpacing: 0.5 },
  brandTag: { fontSize: 10, color: "#bfdcf5" },
  headline: {
    fontSize: 30,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    marginTop: 14,
    lineHeight: 1.15,
  },
  subhead: { fontSize: 12, color: "#d6e9f9", marginTop: 8, lineHeight: 1.5, maxWidth: 380 },

  body: { paddingHorizontal: 44, paddingTop: 24 },

  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 2,
    borderColor: BRAND,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  priceLabel: { fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 1 },
  price: { fontSize: 30, fontFamily: "Helvetica-Bold", color: BRAND_DARK, marginTop: 2 },
  pricePer: { fontSize: 11, color: MUTED, marginTop: 2 },

  qrBlock: { alignItems: "center" },
  qr: { width: 116, height: 116 },
  qrCaption: { fontSize: 8, color: MUTED, marginTop: 4 },

  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginTop: 26,
    marginBottom: 10,
  },

  benefitRow: { flexDirection: "row", marginBottom: 9, alignItems: "flex-start" },
  bullet: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#e8f3fd",
    color: BRAND_DARK,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 3,
    marginRight: 10,
  },
  benefitText: { flex: 1, fontSize: 11, lineHeight: 1.5 },
  benefitStrong: { fontFamily: "Helvetica-Bold" },

  stepsRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  step: {
    flex: 1,
    backgroundColor: "#f6fafe",
    borderRadius: 6,
    padding: 12,
  },
  stepN: { fontSize: 9, fontFamily: "Helvetica-Bold", color: BRAND, marginBottom: 3 },
  stepText: { fontSize: 10, lineHeight: 1.45, color: "#334155" },

  partnerCard: {
    marginTop: 26,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 14,
  },
  partnerLabel: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: 1 },
  partnerName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: INK, marginTop: 3 },
  partnerMeta: { fontSize: 10, color: MUTED, marginTop: 2 },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
  },
  footerText: { fontSize: 8, color: "#94a3b8" },
  smallPrint: { fontSize: 8, color: "#94a3b8", marginTop: 12, lineHeight: 1.5 },
});

export function CarePromoDocument(d: PromoData) {
  // The partner's own discount leads, because that is what the person reading
  // it at that counter actually gets today.
  const ownDiscount = d.partnerKind === "lab" ? d.labDiscountPercent : d.pharmacyDiscountPercent;
  const otherDiscount = d.partnerKind === "lab" ? d.pharmacyDiscountPercent : d.labDiscountPercent;
  const otherWord = d.partnerKind === "lab" ? "medication at partner pharmacies" : "tests at partner labs";

  return (
    <Document
      title={`Poveon Care Plan - ${d.partnerName}`}
      author="Poveon"
      subject="Poveon Care Plan for hypertension and diabetes"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.banner}>
          <View style={styles.brandRow}>
            <Text style={styles.brand}>Poveon</Text>
            <Text style={styles.brandTag}>Care Plan</Text>
          </View>
          <Text style={styles.headline}>
            Living with high blood{"\n"}pressure or diabetes?
          </Text>
          <Text style={styles.subhead}>
            One payment a year gets you your own doctor, money off your tests and medication, and
            someone keeping an eye on your readings between visits.
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceLabel}>Your cover</Text>
              <Text style={styles.price}>{naira(d.priceNaira)}</Text>
              <Text style={styles.pricePer}>for a full year - no monthly bills</Text>
            </View>
            <View style={styles.qrBlock}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={d.qrDataUri} style={styles.qr} />
              <Text style={styles.qrCaption}>Scan to join</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>What you get</Text>

          <View style={styles.benefitRow}>
            <Text style={styles.bullet}>1</Text>
            <Text style={styles.benefitText}>
              <Text style={styles.benefitStrong}>Up to {ownDiscount}% off {d.partnerKind === "lab" ? "your tests" : "your medication"}</Text>
              {" "}here at {d.partnerName} - and at every Poveon partner.
            </Text>
          </View>

          <View style={styles.benefitRow}>
            <Text style={styles.bullet}>2</Text>
            <Text style={styles.benefitText}>
              <Text style={styles.benefitStrong}>Up to {otherDiscount}% off {otherWord}</Text>
              {" "}- your care code works across the whole network.
            </Text>
          </View>

          <View style={styles.benefitRow}>
            <Text style={styles.bullet}>3</Text>
            <Text style={styles.benefitText}>
              <Text style={styles.benefitStrong}>Your own doctor, {d.messageAllowance} messages a year.</Text>
              {" "}Ask about your readings, your medication, how you are feeling. Their replies are
              unlimited.
            </Text>
          </View>

          <View style={styles.benefitRow}>
            <Text style={styles.bullet}>4</Text>
            <Text style={styles.benefitText}>
              <Text style={styles.benefitStrong}>A plan you can actually follow.</Text>
              {" "}Your doctor sets out what to check and when, and sees what you record.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>How to join, in three minutes</Text>
          <View style={styles.stepsRow}>
            <View style={styles.step}>
              <Text style={styles.stepN}>STEP 1</Text>
              <Text style={styles.stepText}>
                Scan the code above with your phone camera.
              </Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepN}>STEP 2</Text>
              <Text style={styles.stepText}>
                Enter your email, set a PIN, and answer a few questions about your health.
              </Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepN}>STEP 3</Text>
              <Text style={styles.stepText}>
                Pay once. Your care code arrives straight away - show it here.
              </Text>
            </View>
          </View>

          <View style={styles.partnerCard}>
            <Text style={styles.partnerLabel}>Your Poveon partner {d.partnerKind}</Text>
            <Text style={styles.partnerName}>{d.partnerName}</Text>
            {d.addressLine && <Text style={styles.partnerMeta}>{d.addressLine}</Text>}
            {d.phone && <Text style={styles.partnerMeta}>{d.phone}</Text>}
            <Text style={styles.partnerMeta}>
              Scanning this code sets {d.partnerName} as your {d.partnerKind}, so they can have your
              {d.partnerKind === "lab" ? " tests" : " medication"} ready.
            </Text>
          </View>

          <Text style={styles.smallPrint}>
            Discounts shown are the maximum available and apply to care covered by the plan. The
            Poveon Care Plan supports the care you get from your doctor; it is not emergency care.
            If you feel unwell, seek medical help straight away.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{d.joinUrl}</Text>
          <Text style={styles.footerText}>Poveon Care Plan</Text>
        </View>
      </Page>
    </Document>
  );
}
