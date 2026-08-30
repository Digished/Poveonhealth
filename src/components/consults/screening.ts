/**
 * The screening questions a member answers when they join, and again on a
 * schedule afterwards.
 *
 * These follow the routine reviews that hypertension and diabetes care already
 * runs on — the things a clinic asks at every visit, because they are how
 * complications announce themselves early: numbness or burning in the feet,
 * chest tightness on exertion, breathlessness lying flat, vision changing, a
 * sore that will not heal.
 *
 * Two rules shape the wording:
 *
 *  - **Plain language, one idea per question.** "Any burning, tingling or
 *    numbness in your feet?" not "peripheral neuropathy symptoms".
 *  - **Nothing here diagnoses.** A red answer means a doctor should look, and
 *    the member is told exactly that. Anything that could be an emergency says
 *    so in its own words rather than being scored quietly.
 */

export type SymptomSeverity = "none" | "mild" | "concerning" | "urgent";

export type ScreeningQuestion = {
  key: string;
  /** Asked of everyone, or only when they have this condition. */
  condition?: "hypertension" | "diabetes";
  group: "heart" | "nerves" | "eyes" | "kidneys" | "feet" | "general";
  /** What a member is asked, in their own words. */
  prompt: string;
  /** The clinical thing being watched, for the doctor's column. */
  tracks: string;
  /** Why it matters, shown under the question. */
  hint?: string;
  /** Answers, worst first in `severity` terms. */
  options: { value: string; label: string; severity: SymptomSeverity }[];
  /** Shown immediately when they pick an urgent answer. */
  urgentAdvice?: string;
};

const YES_NO = (
  yes: string,
  no: string,
  severity: SymptomSeverity = "concerning"
): ScreeningQuestion["options"] => [
  { value: "no", label: no, severity: "none" },
  { value: "yes", label: yes, severity },
];

export const SCREENING_GROUPS: {
  key: ScreeningQuestion["group"];
  label: string;
  blurb: string;
}[] = [
  { key: "heart", label: "Your heart and chest", blurb: "How your heart is coping" },
  { key: "nerves", label: "Nerves and sensation", blurb: "Hands, feet and dizziness" },
  { key: "eyes", label: "Your eyes", blurb: "Vision changes worth catching early" },
  { key: "kidneys", label: "Kidneys and water", blurb: "Swelling and passing water" },
  { key: "feet", label: "Your feet", blurb: "Where small problems get big quietly" },
  { key: "general", label: "Day to day", blurb: "How you have been in yourself" },
];

export const SCREENING_QUESTIONS: ScreeningQuestion[] = [
  // ── Heart and chest ─────────────────────────────────────────────────────
  {
    key: "chest_tightness",
    group: "heart",
    prompt: "Any chest tightness, pressure or pain?",
    tracks: "Angina / cardiac chest pain",
    hint: "Especially when walking uphill, hurrying, or after a heavy meal.",
    options: [
      { value: "none", label: "No, none", severity: "none" },
      { value: "on_exertion", label: "Only when I exert myself", severity: "concerning" },
      { value: "at_rest", label: "Even when I'm resting", severity: "urgent" },
    ],
    urgentAdvice:
      "Chest pain at rest needs to be seen today. Please go to the nearest hospital — do not wait for a reply here.",
  },
  {
    key: "breathless",
    group: "heart",
    prompt: "Are you getting short of breath?",
    tracks: "Heart failure / fluid overload",
    hint: "Climbing stairs, walking your usual distance, or lying flat at night.",
    options: [
      { value: "none", label: "No more than usual", severity: "none" },
      { value: "exertion", label: "When I walk or climb stairs", severity: "concerning" },
      { value: "lying_flat", label: "When I lie flat, or it wakes me", severity: "urgent" },
    ],
    urgentAdvice:
      "Breathlessness that wakes you or stops you lying flat should be seen urgently. Please go to a hospital today.",
  },
  {
    key: "palpitations",
    group: "heart",
    prompt: "Any racing or fluttering heartbeat?",
    tracks: "Arrhythmia",
    options: YES_NO("Yes, sometimes", "No"),
  },

  // ── Nerves ──────────────────────────────────────────────────────────────
  {
    key: "paraesthesia",
    group: "nerves",
    condition: "diabetes",
    prompt: "Any burning, tingling or numbness in your hands or feet?",
    tracks: "Peripheral neuropathy",
    hint: "Often worse at night, and often the first sign nerves are affected.",
    options: [
      { value: "none", label: "No", severity: "none" },
      { value: "occasional", label: "Now and then", severity: "mild" },
      { value: "most_days", label: "Most days", severity: "concerning" },
      { value: "constant", label: "All the time, or it stops me sleeping", severity: "concerning" },
    ],
  },
  {
    key: "weakness",
    group: "nerves",
    prompt: "Any sudden weakness, or trouble speaking or smiling?",
    tracks: "Stroke / TIA",
    hint: "Even if it passed after a few minutes.",
    options: [
      { value: "no", label: "No", severity: "none" },
      { value: "passed", label: "Yes, but it passed", severity: "urgent" },
      { value: "now", label: "Yes, and it is still there", severity: "urgent" },
    ],
    urgentAdvice:
      "Sudden weakness or trouble speaking is an emergency, even if it passed. Go to a hospital now.",
  },
  {
    key: "dizziness",
    group: "nerves",
    prompt: "Feeling dizzy or light-headed when you stand up?",
    tracks: "Postural hypotension / over-treatment",
    options: [
      { value: "no", label: "No", severity: "none" },
      { value: "sometimes", label: "Sometimes", severity: "mild" },
      { value: "often", label: "Often, or I have nearly fallen", severity: "concerning" },
    ],
  },

  // ── Eyes ────────────────────────────────────────────────────────────────
  {
    key: "vision",
    group: "eyes",
    prompt: "Has your vision changed?",
    tracks: "Retinopathy / hypertensive eye disease",
    hint: "Blurring, floaters, dark patches, or things looking dimmer than before.",
    options: [
      { value: "no", label: "No change", severity: "none" },
      { value: "blurry", label: "A bit blurry sometimes", severity: "concerning" },
      { value: "sudden", label: "It changed suddenly, or I lost part of my sight", severity: "urgent" },
    ],
    urgentAdvice: "Sudden vision loss needs to be seen today. Please go to a hospital or eye clinic.",
  },

  // ── Kidneys ─────────────────────────────────────────────────────────────
  {
    key: "swelling",
    group: "kidneys",
    prompt: "Any swelling in your feet, ankles or face?",
    tracks: "Fluid retention / kidney involvement",
    options: [
      { value: "no", label: "No", severity: "none" },
      { value: "evenings", label: "By the evening", severity: "mild" },
      { value: "constant", label: "Most of the time", severity: "concerning" },
    ],
  },
  {
    key: "urine",
    group: "kidneys",
    prompt: "Any change in how you pass water?",
    tracks: "Kidney function / glycaemic control",
    hint: "Passing much more or much less than usual, foamy urine, or getting up at night.",
    options: [
      { value: "no", label: "No change", severity: "none" },
      { value: "more", label: "Much more than usual", severity: "concerning" },
      { value: "less", label: "Much less than usual", severity: "concerning" },
      { value: "foamy", label: "It looks foamy or frothy", severity: "concerning" },
    ],
  },

  // ── Feet ────────────────────────────────────────────────────────────────
  {
    key: "foot_wound",
    group: "feet",
    condition: "diabetes",
    prompt: "Any cut, sore or blister on your feet?",
    tracks: "Diabetic foot ulcer",
    hint: "Check the soles and between your toes — a sore there can be painless.",
    options: [
      { value: "no", label: "No", severity: "none" },
      { value: "healing", label: "Yes, and it is healing", severity: "concerning" },
      { value: "not_healing", label: "Yes, and it is not healing", severity: "urgent" },
    ],
    urgentAdvice:
      "A foot sore that is not healing needs to be seen this week — sooner if it smells, leaks or the skin around it is dark.",
  },

  // ── General ─────────────────────────────────────────────────────────────
  {
    key: "hypo_symptoms",
    group: "general",
    condition: "diabetes",
    prompt: "Any shakiness, sweating or confusion between meals?",
    tracks: "Hypoglycaemia",
    hint: "Which usually settles after you eat something sweet.",
    options: [
      { value: "no", label: "No", severity: "none" },
      { value: "rare", label: "Once or twice", severity: "mild" },
      { value: "often", label: "Often", severity: "concerning" },
    ],
  },
  {
    key: "headaches",
    group: "general",
    condition: "hypertension",
    prompt: "Any headaches at the back of your head, especially in the morning?",
    tracks: "Poorly controlled blood pressure",
    options: YES_NO("Yes", "No", "mild"),
  },
  {
    key: "wellbeing",
    group: "general",
    prompt: "How have you been feeling in yourself?",
    tracks: "General wellbeing and mood",
    options: [
      { value: "good", label: "Good", severity: "none" },
      { value: "ok", label: "Up and down", severity: "mild" },
      { value: "low", label: "Low, tired, or not myself", severity: "concerning" },
    ],
  },
];

/** The questions that apply to someone with these conditions. */
export function questionsFor(conditions: string[]): ScreeningQuestion[] {
  return SCREENING_QUESTIONS.filter((q) => !q.condition || conditions.includes(q.condition));
}

const SEVERITY_RANK: Record<SymptomSeverity, number> = {
  urgent: 3,
  concerning: 2,
  mild: 1,
  none: 0,
};

export function severityOf(questionKey: string, answer: string): SymptomSeverity {
  const q = SCREENING_QUESTIONS.find((x) => x.key === questionKey);
  return q?.options.find((o) => o.value === answer)?.severity ?? "none";
}

/** The worst thing in a set of answers, and which questions caused it. */
export function worstOf(answers: Record<string, string>): {
  severity: SymptomSeverity;
  flagged: { key: string; prompt: string; label: string; severity: SymptomSeverity }[];
} {
  const flagged: { key: string; prompt: string; label: string; severity: SymptomSeverity }[] = [];
  let severity: SymptomSeverity = "none";

  for (const [key, answer] of Object.entries(answers)) {
    const q = SCREENING_QUESTIONS.find((x) => x.key === key);
    const option = q?.options.find((o) => o.value === answer);
    if (!q || !option || option.severity === "none") continue;
    flagged.push({ key, prompt: q.prompt, label: option.label, severity: option.severity });
    if (SEVERITY_RANK[option.severity] > SEVERITY_RANK[severity]) severity = option.severity;
  }

  flagged.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  return { severity, flagged };
}

/** Anything that should be acted on now rather than at the next review. */
export function urgentAdvice(answers: Record<string, string>): string[] {
  return Object.entries(answers)
    .map(([key, answer]) => {
      const q = SCREENING_QUESTIONS.find((x) => x.key === key);
      if (!q?.urgentAdvice) return null;
      return q.options.find((o) => o.value === answer)?.severity === "urgent" ? q.urgentAdvice : null;
    })
    .filter((x): x is string => !!x);
}

export const SEVERITY_LABEL: Record<SymptomSeverity, string> = {
  urgent: "Needs care now",
  concerning: "Worth a look",
  mild: "Mild",
  none: "Nothing reported",
};

/**
 * How long until the next round, in days.
 *
 * Someone who reports nothing is asked monthly — often enough to catch a change,
 * rarely enough that they still answer honestly. Anything flagged tightens the
 * loop, because the point of asking again is to see whether it settled.
 */
export const SCREENING_INTERVAL_DAYS: Record<SymptomSeverity, number> = {
  urgent: 3,
  concerning: 7,
  mild: 14,
  none: 30,
};

/** The date the next round falls due, as a plain yyyy-mm-dd day. */
export function nextDueOn(severity: SymptomSeverity, from: Date = new Date()): Date {
  const due = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  due.setUTCDate(due.getUTCDate() + SCREENING_INTERVAL_DAYS[severity]);
  return due;
}

export const SEVERITY_TONE: Record<
  SymptomSeverity,
  { text: string; bg: string; border: string; dot: string }
> = {
  urgent: { text: "text-red-700", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" },
  concerning: {
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  mild: { text: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200", dot: "bg-sky-500" },
  none: {
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
};
