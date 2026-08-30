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
 * Two constraints shape the design:
 *
 *  - **It must be one page.** A flyer that spills onto a second sheet is not a
 *    flyer. The vertical budget below is deliberate and adds up to less than
 *    A4's 842pt; if you add a block, take the space from somewhere.
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

  headRow: { flexDirection: "row", marginTop: 22 },
  headLeft: { flex: 1, paddingRight: 18 },
  chips: { width: 132 },
  chip: {
    borderWidth: 1,
    borderColor: "#2f5d85",
    borderRadius: 6,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 8,
  },
  chipTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  chipBody: { fontSize: 7.5, color: "#8fc4ec", marginTop: 2, lineHeight: 1.4 },

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
  partnerBadgeKind: { fontSize: 7, color: MUTED, letterSpacing: 1.1, marginTop: 3, textAlign: "center" },
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
    padding: 14,
    alignItems: "center",
  },
  offerLeft: { flex: 1, paddingRight: 14 },
  perMonth: {
    alignSelf: "flex-start",
    marginTop: 9,
    backgroundColor: BRAND_TINT,
    borderRadius: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  perMonthText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: BRAND },
  kicker: { fontSize: 7.5, color: MUTED, letterSpacing: 1.6 },
  price: { fontSize: 34, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 3, letterSpacing: -0.5 },
  priceFoot: { fontSize: 9.5, color: MUTED, marginTop: 3 },
  offerDivider: { width: 1, alignSelf: "stretch", backgroundColor: HAIR, marginRight: 14 },
  qrBox: { alignItems: "center", width: 100 },
  qr: { width: 88, height: 88 },
  qrCaption: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 5, letterSpacing: 0.4 },

  // ── Body ──────────────────────────────────────────────────────────────────
  // Grows to fill whatever is left, which is what pins the footer to the foot.
  body: { flexGrow: 1, paddingHorizontal: PAGE_X, paddingTop: 18 },
  sectionRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 12.5, fontFamily: "Helvetica-Bold", color: INK },
  sectionRule: { flex: 1, height: 1, backgroundColor: HAIR, marginLeft: 12 },

  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  cell: { width: "50%", paddingHorizontal: 5, marginBottom: 8 },
  card: { backgroundColor: BRAND_TINT, borderRadius: 8, padding: 11, height: 72 },
  cardBig: { fontSize: 19, fontFamily: "Helvetica-Bold", color: BRAND, letterSpacing: -0.3 },
  cardTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK, marginTop: 3 },
  cardBody: { fontSize: 8.5, color: MUTED, marginTop: 3, lineHeight: 1.45, maxLines: 3 },

  savingsBand: {
    flexDirection: "row",
    backgroundColor: NAVY,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginTop: 2,
  },
  savingCell: { flex: 1, paddingHorizontal: 10 },
  savingDivider: { borderRightWidth: 1, borderRightColor: "#1d4468" },
  savingTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  savingBody: { fontSize: 7.5, color: "#a9cbe6", marginTop: 3, lineHeight: 1.45 },

  // ── Steps ────────────────────────────────────────────────────────────────
  steps: { flexDirection: "row", marginHorizontal: -6 },
  stepCell: { flex: 1, paddingHorizontal: 6 },
  stepBar: { height: 3, borderRadius: 2, backgroundColor: ACCENT, width: 22, marginBottom: 7 },
  stepN: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: ACCENT, letterSpacing: 1.2 },
  stepText: { fontSize: 9, color: "#334155", lineHeight: 1.5, marginTop: 3 },

  smallPrint: { fontSize: 7, color: "#94a3b8", lineHeight: 1.45, marginTop: 8 },

  // ── Footer band ──────────────────────────────────────────────────────────
  footer: {
    backgroundColor: NAVY,
    paddingVertical: 14,
    paddingHorizontal: PAGE_X,
    flexDirection: "row",
    alignItems: "center",
  },
  footerLabel: { fontSize: 7.5, color: "#7fb4dd", letterSpacing: 1.6 },
  footerName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#ffffff", marginTop: 3, maxLines: 2 },
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

  const benefits = [
    {
      big: `${ownPct}% off`,
      title: isLab ? "Your lab tests" : "Your medication",
      body: "Here at this counter, and at every other Poveon partner in the network.",
    },
    {
      big: `${otherPct}% off`,
      title: isLab ? "Your medication" : "Your lab tests",
      body: "The same care code works across the whole network.",
    },
    {
      big: `${d.messageAllowance} messages`,
      title: "A doctor in your pocket",
      body: "Ask from home instead of taking a day off to sit in a waiting room. Their replies are unlimited.",
    },
    {
      big: "No wasted trips",
      title: "Everything on your phone",
      body: "Your plan, your readings and your prescriptions live in one place you can open anywhere.",
    },
  ];

  // Why it is cheaper than the way most people manage these conditions now.
  const savings = [
    { t: "Fewer trips", b: "No transport and no lost day's pay for a routine check-in." },
    { t: "Less spent at the counter", b: `Up to ${Math.max(ownPct, otherPct)}% off across the network, all year.` },
    { t: "Caught earlier", b: "Small problems handled in a message, before they become a hospital bill." },
  ];

  const steps = [
    { n: "STEP 1", t: "Scan the code above with your phone camera." },
    { n: "STEP 2", t: "Add your email and set a PIN." },
    { n: "STEP 3", t: "Pay once. Your care code arrives straight away." },
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
                <Text style={s.headlineAccent}>Get it{"\n"}properly looked after.</Text>
              </Text>
              <Text style={s.subhead}>
                One payment a year. Your own doctor, money off your tests and medication, and
                someone watching your readings between visits.
              </Text>
            </View>

            <View style={s.chips}>
              {/* The partner's own badge leads: someone picks this up at their
                  counter, and it should look like it came from them. */}
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
                <Text style={s.partnerBadgeKind}>
                  YOUR POVEON {isLab ? "LAB" : "PHARMACY"}
                </Text>
              </View>

              <View style={[s.chip, { marginTop: 8 }]}>
                <Text style={s.chipTitle}>All on your phone</Text>
                <Text style={s.chipBody}>No queue, no appointment, no travelling to be told to come back</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.offerWrap}>
          <View style={s.offer}>
            <View style={s.offerLeft}>
              <Text style={s.kicker}>A FULL YEAR OF COVER</Text>
              <Text style={s.price}>{naira(d.priceNaira)}</Text>
              <Text style={s.priceFoot}>No monthly bills. No renewal until next year.</Text>
              {/* The yearly figure is the one people flinch at; the monthly one
                  is how they actually judge it. Derived, so it never drifts. */}
              <View style={s.perMonth}>
                <Text style={s.perMonthText}>
                  Works out at about {naira(Math.round(d.priceNaira / 12))} a month
                </Text>
              </View>
            </View>
            <View style={s.offerDivider} />
            <View style={s.qrBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={d.qrDataUri} style={s.qr} />
              <Text style={s.qrCaption}>SCAN TO JOIN</Text>
            </View>
          </View>
        </View>

        <View style={s.body}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>What your care code gets you</Text>
            <View style={s.sectionRule} />
          </View>

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

          <View style={s.savingsBand}>
            {savings.map((x, i) => (
              <View key={x.t} style={[s.savingCell, i < savings.length - 1 ? s.savingDivider : {}]}>
                <Text style={s.savingTitle}>{x.t}</Text>
                <Text style={s.savingBody}>{x.b}</Text>
              </View>
            ))}
          </View>

          <View style={[s.sectionRow, { marginTop: 12 }]}>
            <Text style={s.sectionTitle}>Joining takes three minutes</Text>
            <View style={s.sectionRule} />
          </View>

          <View style={s.steps}>
            {steps.map((st) => (
              <View key={st.n} style={s.stepCell}>
                <View style={s.stepBar} />
                <Text style={s.stepN}>{st.n}</Text>
                <Text style={s.stepText}>{st.t}</Text>
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
            <Text style={s.footerLabel}>YOUR POVEON PARTNER {isLab ? "LAB" : "PHARMACY"}</Text>
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
