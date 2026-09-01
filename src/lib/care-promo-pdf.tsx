import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";

// react-pdf hyphenates by default, which breaks proper nouns in the middle
// ("Radiology An-nexe") and looks like a typo on a printed flyer. Wrap whole
// words instead.
Font.registerHyphenationCallback((word) => [word]);

/**
 * The A4 flyer a lab or pharmacy prints and puts on the counter.
 *
 * Every figure comes from the live settings — the price, both discounts, the
 * message allowance — so changing the price in the admin dashboard changes
 * every poster printed from that moment on. Nothing is baked in.
 *
 * Three constraints shape the design:
 *
 *  - **One page, and most of it empty.** This is read standing at a counter in
 *    a few seconds, by someone who did not come in for it. It carries four
 *    things: what it is for, what it costs, what you get, and the code to
 *    scan. Everything else that used to be here — a strip of reasons, a
 *    three-step how-to, a second discount card — competed with the code and
 *    made a poster nobody finishes. If you add a block, take out a block.
 *  - **The QR is the call to action.** No numbered steps explaining how to
 *    point a camera at it. The one instruction is under the code.
 *  - **Helvetica only.** The built-in font needs no download, but it has no em
 *    dash and no fancy glyphs — react-pdf drops missing ones silently, leaving
 *    a gap mid-sentence. Hyphens only.
 */

export type PromoData = {
  partnerName: string;
  partnerKind: "lab" | "pharmacy";
  addressLine: string | null;
  phone: string | null;
  /** A PNG data URI of the partner's sign-up QR code. */
  qrDataUri: string;
  /** A data URI of the partner's own logo, when they have one. */
  logoDataUri?: string | null;
  joinUrl: string;
  priceNaira: number;
  labDiscountPercent: number;
  pharmacyDiscountPercent: number;
  messageAllowance: number;
};

const naira = (n: number) => `NGN ${Math.round(n).toLocaleString("en-NG")}`;

// A tight palette: one brand blue at three depths, one warm accent, and ink.
const NAVY = "#062a4a";
const BRAND = "#0270c3";
const BRAND_TINT = "#eef6fd";
const ACCENT = "#00b37e";
const INK = "#0f172a";
const MUTED = "#64748b";
const HAIR = "#e4ebf2";

const PAGE_X = 40;

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: INK,
    display: "flex",
    flexDirection: "column",
  },
  topRule: { height: 5, backgroundColor: ACCENT },

  // ── Header ────────────────────────────────────────────────────────────────
  header: { backgroundColor: NAVY, paddingTop: 24, paddingBottom: 56, paddingHorizontal: PAGE_X },
  eyebrowRow: { flexDirection: "row", alignItems: "center" },
  wordmark: { fontSize: 17, fontFamily: "Helvetica-Bold", color: "#ffffff", letterSpacing: 0.3 },
  eyebrowRule: { flex: 1, height: 1, backgroundColor: "#ffffff", opacity: 0.18, marginLeft: 12, marginRight: 12 },
  eyebrow: { fontSize: 8, color: "#8fc4ec", letterSpacing: 2 },

  headRow: { flexDirection: "row", marginTop: 22, alignItems: "flex-start" },
  headLeft: { flex: 1, paddingRight: 18 },

  headline: { fontSize: 25, fontFamily: "Helvetica-Bold", color: "#ffffff", lineHeight: 1.12 },

  // The partner's own badge, top right — this is their flyer as much as ours.
  partnerBadge: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    width: 132,
  },
  partnerLogo: { width: 74, height: 44, objectFit: "contain", marginBottom: 6 },
  partnerBadgeName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    textAlign: "center",
    maxLines: 2,
    textOverflow: "ellipsis",
  },
  partnerBadgeKind: { fontSize: 7, color: MUTED, letterSpacing: 1.1, marginTop: 4, textAlign: "center" },
  partnerBadgeMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BRAND_TINT,
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  partnerBadgeInitial: { fontSize: 19, fontFamily: "Helvetica-Bold", color: BRAND },
  headlineAccent: { color: "#5cc8ff" },
  subhead: { fontSize: 10.5, color: "#c2dcf1", marginTop: 8, lineHeight: 1.5 },

  // ── The offer card, lifted over the header edge ──────────────────────────
  offerWrap: { marginTop: -44, paddingHorizontal: PAGE_X },
  offer: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: HAIR,
    borderRadius: 10,
    padding: 18,
    alignItems: "center",
  },
  offerLeft: { flex: 1, paddingRight: 14 },
  kicker: { fontSize: 7.5, color: MUTED, letterSpacing: 1.6 },
  price: { fontSize: 40, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 3, letterSpacing: -0.5 },
  priceFoot: { fontSize: 9.5, color: MUTED, marginTop: 3 },
  offerDivider: { width: 1, alignSelf: "stretch", backgroundColor: HAIR, marginRight: 14 },
  qrBox: { alignItems: "center", width: 116 },
  qr: { width: 104, height: 104 },
  qrCaption: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 6, letterSpacing: 0.6 },
  qrHint: { fontSize: 7, color: MUTED, marginTop: 2, textAlign: "center" },

  // ── Body ──────────────────────────────────────────────────────────────────
  // Grows to fill whatever is left, which is what pins the footer to the foot.
  body: { flexGrow: 1, paddingHorizontal: PAGE_X, paddingTop: 18 },
  grid: { flexDirection: "row", marginHorizontal: -5 },
  cell: { width: "33.333%", paddingHorizontal: 5 },
  card: { backgroundColor: BRAND_TINT, borderRadius: 8, padding: 14, height: 96 },
  cardBig: { fontSize: 18, fontFamily: "Helvetica-Bold", color: BRAND, letterSpacing: -0.3, maxLines: 2 },
  cardTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK, marginTop: 4 },
  cardBody: { fontSize: 8.5, color: MUTED, marginTop: 4, lineHeight: 1.45, maxLines: 3 },

  smallPrint: { fontSize: 7, color: "#94a3b8", lineHeight: 1.45, marginTop: "auto", paddingTop: 16 },

  // ── Footer band ──────────────────────────────────────────────────────────
  footer: {
    backgroundColor: NAVY,
    paddingVertical: 14,
    paddingHorizontal: PAGE_X,
    flexDirection: "row",
    alignItems: "center",
  },
  footerName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#ffffff", maxLines: 2 },
  footerMeta: { fontSize: 9, color: "#a9cbe6", marginTop: 2, maxLines: 1, textOverflow: "ellipsis" },
  footerRight: { alignItems: "flex-end", maxWidth: 210 },
  footerUrl: { fontSize: 8, color: "#7fb4dd" },
});

export function CarePromoDocument(d: PromoData) {
  // The partner's own discount leads: it is what the person holding this at
  // that counter gets today.
  const isLab = d.partnerKind === "lab";
  const ownPct = isLab ? d.labDiscountPercent : d.pharmacyDiscountPercent;
  const otherPct = isLab ? d.pharmacyDiscountPercent : d.labDiscountPercent;

  // Three, because a fourth is the one nobody reads.
  const benefits = [
    {
      big: `${ownPct}% off`,
      title: isLab ? "Lab tests" : "Medication",
      body: "Here, and at every Poveon partner.",
    },
    {
      big: `${otherPct}% off`,
      title: isLab ? "Medication" : "Lab tests",
      body: "The same code works across the network.",
    },
    {
      big: "Your own doctor",
      title: `${d.messageAllowance} messages`,
      body: "Ask from home. Their replies are unlimited.",
    },
  ];

  return (
    <Document
      title={`Poveon Care Plan - ${d.partnerName}`}
      author="Poveon"
      subject="Poveon Care Plan for hypertension and diabetes"
    >
      <Page size="A4" style={s.page}>
        <View style={s.topRule} />

        <View style={s.header}>
          <View style={s.eyebrowRow}>
            <Text style={s.wordmark}>Poveon</Text>
            <View style={s.eyebrowRule} />
            <Text style={s.eyebrow}>CARE PLAN</Text>
          </View>

          <View style={s.headRow}>
            <View style={s.headLeft}>
              <Text style={s.headline}>
                High blood pressure{"\n"}or diabetes?{" "}
                <Text style={s.headlineAccent}>Get it properly{"\n"}looked after.</Text>
              </Text>
              <Text style={s.subhead}>
                Your own doctor, money off your tests and medication, and someone watching your
                readings between visits.
              </Text>
            </View>

            {/* The partner's badge: someone picks this up at their counter, and
                it should look like it came from them. */}
            <View style={s.partnerBadge}>
              {d.logoDataUri ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={d.logoDataUri} style={s.partnerLogo} />
              ) : (
                <View style={s.partnerBadgeMark}>
                  <Text style={s.partnerBadgeInitial}>
                    {(d.partnerName || "P").trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={s.partnerBadgeName}>{d.partnerName}</Text>
              <Text style={s.partnerBadgeKind}>YOUR POVEON {isLab ? "LAB" : "PHARMACY"}</Text>
            </View>
          </View>
        </View>

        {/* The price and the code, together, over the header edge. This is the
            whole poster; everything else supports it. */}
        <View style={s.offerWrap}>
          <View style={s.offer}>
            <View style={s.offerLeft}>
              <Text style={s.kicker}>A FULL YEAR OF COVER</Text>
              <Text style={s.price}>{naira(d.priceNaira)}</Text>
              <Text style={s.priceFoot}>Paid once. No monthly bills.</Text>
            </View>
            <View style={s.offerDivider} />
            <View style={s.qrBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={d.qrDataUri} style={s.qr} />
              <Text style={s.qrCaption}>SCAN TO JOIN</Text>
              <Text style={s.qrHint}>Point your camera at it</Text>
            </View>
          </View>
        </View>

        <View style={s.body}>
          <View style={s.grid}>
            {benefits.map((b) => (
              <View key={b.title} style={s.cell}>
                <View style={s.card}>
                  <Text style={s.cardBig}>{b.big}</Text>
                  <Text style={s.cardTitle}>{b.title}</Text>
                  <Text style={s.cardBody}>{b.body}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={s.smallPrint}>
            Discounts shown are the maximum available and apply to care covered by the plan. The
            Poveon Care Plan supports the care you get from your doctor; it is not emergency care.
            If you feel unwell, seek medical help straight away.
          </Text>
        </View>

        <View style={s.footer}>
          <View style={{ flex: 1 }}>
            <Text style={[s.footerName, d.partnerName.length > 34 ? { fontSize: 12 } : {}]}>
              {d.partnerName}
            </Text>
            {(d.addressLine || d.phone) && (
              <Text style={s.footerMeta}>
                {[d.addressLine, d.phone].filter(Boolean).join("  ·  ")}
              </Text>
            )}
          </View>
          <View style={s.footerRight}>
            <Text style={s.footerUrl}>{d.joinUrl}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
