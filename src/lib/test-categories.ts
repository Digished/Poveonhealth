/**
 * Maps individual test names/abbreviations to patient-friendly category labels.
 * Used in patient-facing surfaces (email, /r/[code] page) to hide clinical
 * detail while still informing the patient of what kind of tests are needed.
 */

type CategoryRule = { category: string; keywords: RegExp };

const RULES: CategoryRule[] = [
  // ── Imaging ──────────────────────────────────────────────────────────────
  {
    category: "X-Ray",
    keywords: /\bx[-\s]?ray\b|xray|\bcxr\b|\bchest\s+x\b/i,
  },
  {
    category: "CT Scan",
    keywords: /\bct\s*(scan|brain|chest|abdomen|head|pelvis|spine|neck|thorax|angiogram|coronary|pulmonary)\b|\bcomputed\s+tomography\b/i,
  },
  {
    category: "MRI",
    keywords: /\bmri\b|\bmagnetic\s+resonance\b/i,
  },
  {
    category: "Ultrasound",
    keywords: /\bultrasound\b|\buss\b|\bus\s+(abdomen|pelvis|breast|thyroid|testicular|prostate|liver|kidney|renal|obstetric|pelvic|abdominal)\b|\bechocardiograph|\becho\b|\bdoppler\b|\bfetal\s+scan\b|\bobstetric\b/i,
  },
  {
    category: "Mammography",
    keywords: /\bmammograph|\bmammogram\b/i,
  },
  {
    category: "Fluoroscopy",
    keywords: /\bfluoroscop|\bbarium\b|\bcontrast\s+study\b/i,
  },
  {
    category: "PET Scan",
    keywords: /\bpet\s*(scan)?\b|\bpositron\b/i,
  },
  {
    category: "DEXA Scan",
    keywords: /\bdexa\b|\bbone\s+density\b|\bdensitometry\b/i,
  },

  // ── Histopathology / Cytology ─────────────────────────────────────────
  {
    category: "Biopsy / Histology",
    keywords: /\bbiopsy\b|\bhistolog|\bfnac\b|\bfine\s+needle\b|\bcytolog|\bpap\s*smear\b|\bpap\s*test\b|\bcervical\s+swab\b|\bhpv\b/i,
  },

  // ── Microbiology ──────────────────────────────────────────────────────
  {
    category: "Microbiology",
    keywords: /\b(blood|wound|throat|ear|eye|nasal|swab|high\s+vaginal|hvs|urethral|rectal|stool|sputum|csf)\s*(mcs|culture|sensitivity)\b|\bafb\b|\bacid\s+fast\b|\bgene\s*xpert\b|\btuberculosis\b|\btb\s+test\b|\bmalaria\s*(parasite|film|smear|rdt|rapid)?\b|\bmp\b|\bgram\s+stain\b/i,
  },

  // ── Stool / Faeces ────────────────────────────────────────────────────
  {
    category: "Stool Test",
    keywords: /\bstool\b|\bfaec(es|al)\b|\bfec(es|al)\b|\bO\s*&?\s*P\b|\bova\s*(cysts?\s*and\s*parasites?|and\s*parasites?)\b|\bocP\b/i,
  },

  // ── Urine ─────────────────────────────────────────────────────────────
  {
    category: "Urine Test",
    keywords: /\burin(alysis|e|ary)\b|\burine\s*(r\s*\/?\s*e|routine|mcs|culture|protein|glucose|creatinine|24.hour)\b|\bure\b/i,
  },

  // ── Blood Tests (broad — catches everything else haematology/biochemistry) ──
  {
    category: "Blood Test",
    keywords:
      /\bfbc\b|\bcbc\b|\bfull\s+blood\s+count\b|\bcomplete\s+blood\s+count\b|\bhaemogram\b|\bhemogram\b|\bblood\s+group(ing)?\b|\bpcv\b|\bhaematocrit\b|\bhematocrit\b|
\blft\b|\bliver\s+function\b|\balt\b|\bast\b|\balp\b|\bggT\b|\bggt\b|\bbilirubin\b|\balbumin\b|\btotal\s+protein\b|
\brft\b|\brenal\s+function\b|\bkidney\s+function\b|\be\s*\/?\s*u\s*\/?\s*cr\b|\burea\b|\bcreatinine\b|\begfr\b|
\belectrolytes\b|\bserum\s*(electrolytes|sodium|potassium|chloride|calcium|phosphate|magnesium|bicarbonate)\b|\bna\+?\b|\bk\+?\b|
\bglucose\b|\bblood\s+sugar\b|\bfasting\s*(blood\s*sugar|glucose)\b|\brandom\s*(blood\s*sugar|glucose)\b|\bhba1c\b|\bdiabetes\s+screen\b|\bogtt\b|
\blipid\s*profile\b|\bcholesterol\b|\btriglycerides?\b|\bhdl\b|\bldl\b|\bvldl\b|
\bthyroid\b|\btsh\b|\bt3\b|\bt4\b|\bfree\s+t[34]\b|\bthyroxine\b|
\bferritin\b|\biron\s+(stud|level|panel)\b|\btibc\b|\btransferrin\b|
\bvitamin\s+[bd12]\b|\bvit\s+[bd12]\b|\bfolate\b|\bvitamin\s+b\d+\b|
\besr\b|\bcrp\b|\bc.reactive\b|\bsedimentat\b|
\bwidal\b|\btyphoid\b|\bhiv\b|\bhbsag\b|\bhbv\b|\bhcv\b|\bhepatitis\b|\bvdrl\b|\brpr\b|\bsyphilis\b|
\bmalaria\s+(antibody|antigen|serology)\b|
\bpt\b|\binr\b|\baptt\b|\bclotting\b|\bbleeding\s+time\b|\bprothrombin\b|\bd.dimer\b|\bfibrinogen\b|
\bpsa\b|\bca\s*125\b|\bca\s*19\.9\b|\bca\s*15\.3\b|\bcea\b|\bafp\b|\btumour\s+marker\b|\btumor\s+marker\b|
\btestosterone\b|\boestrogen\b|\bestrogen\b|\bprogesterone\b|\bfsh\b|\blh\b|\bprolactin\b|\bcortisol\b|\binsulin\b|\bhcg\b|\bpregnancy\s+test\b|
\brheumatoid\b|\bra\s+factor\b|\banti.?nuclear\b|\bana\b|\bdouble\s+strand\b|\banti.?ccp\b|
\bcd4\b|\bcomplete\s+metabolic\b|\bcomp\s+metabolic\b|\bbmp\b|\bcmp\b|\bbasic\s+metabolic\b|
\bblood\s+culture\b|\bserum\b|\bblood\s+film\b|\bperipheral\s+film\b|\bperipheral\s+smear\b/i,
  },
];

/**
 * Convert a raw tests string (e.g. "FBC, Chest X-Ray, Urinalysis, LFT") into
 * a deduplicated list of patient-friendly category labels
 * (e.g. ["Blood Test", "X-Ray", "Urine Test"]).
 *
 * Any test that doesn't match a known category is grouped under "Other Tests".
 */
export function testsToCategories(testsString: string): string[] {
  if (!testsString || testsString === "See attached image") return [];

  const items = testsString
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const categories: string[] = [];
  let hasUnmatched = false;

  for (const item of items) {
    const rule = RULES.find((r) => r.keywords.test(item));
    const cat = rule ? rule.category : null;
    if (cat) {
      if (!seen.has(cat)) {
        seen.add(cat);
        categories.push(cat);
      }
    } else {
      hasUnmatched = true;
    }
  }

  if (hasUnmatched) {
    const fallback = "Other Tests";
    if (!seen.has(fallback)) categories.push(fallback);
  }

  return categories;
}
