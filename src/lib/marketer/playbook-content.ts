// Curated, field-tested selling content for marketers. Scripts use {{doctor}}
// and {{me}} placeholders filled client-side before sending/copying.

export const ELEVATOR_PITCH =
  "Doctor, Poveon lets you order any lab test for your patient in 30 seconds — they get the sample taken near them, you get the result back fast, and you can track everything. No paperwork, no chasing labs. Can I show you on one patient right now?";

export interface Objection {
  objection: string;
  rebuttal: string;
}

export const OBJECTIONS: Objection[] = [
  {
    objection: "I already use a lab I trust.",
    rebuttal:
      "Keep them — Poveon doesn't replace your lab, it makes ordering and tracking effortless and gives your patient options on price and location. Try it on one non-urgent test this week and compare the experience.",
  },
  {
    objection: "Results take too long / labs are unreliable.",
    rebuttal:
      "That's exactly what we fixed. Every request is tracked stage by stage and you're notified the moment results are ready — you stop chasing. Let me show you the turnaround on a real test.",
  },
  {
    objection: "My patients can't afford tests.",
    rebuttal:
      "Poveon shows transparent prices up front and lets patients pick the most affordable accredited option near them — so fewer patients abandon the test. That's more completed tests, not fewer.",
  },
  {
    objection: "I'm too busy to learn a new tool.",
    rebuttal:
      "There's nothing to learn — it's one short form, or you can type the tests in plain language. It takes me 60 seconds to set you up and we'll send your first real request together right now.",
  },
  {
    objection: "Is my patients' data safe?",
    rebuttal:
      "Yes — requests are private to you and the lab you choose, and patients only get a code. Nothing is shared beyond the test you order.",
  },
  {
    objection: "What's in it for me?",
    rebuttal:
      "Faster, trackable results means happier patients and fewer follow-up calls — and you build one place that remembers every patient and test you've ordered.",
  },
];

export interface Script {
  key: string;
  label: string;
  body: string; // {{doctor}} / {{me}} placeholders
}

export const SCRIPTS: Script[] = [
  {
    key: "intro",
    label: "First intro",
    body:
      "Hello Dr {{doctor}}, it's {{me}} from Poveon. I'd love to show you a faster way to order and track your patients' lab tests — takes 60 seconds and your first test is on me to set up. When works for a quick 5 minutes today?",
  },
  {
    key: "first_test",
    label: "Send first test together",
    body:
      "Dr {{doctor}}, let's send one real test now so you see how it works end to end. Tell me the patient and the test and I'll set it up with you — you'll get the result tracked automatically.",
  },
  {
    key: "winback",
    label: "Win-back (gone quiet)",
    body:
      "Hi Dr {{doctor}}, {{me}} from Poveon checking in — haven't seen a request from you in a while. Anything I can make easier? Happy to send your next test together so it's effortless.",
  },
  {
    key: "thank_referral",
    label: "Thank you + ask for referral",
    body:
      "Thank you Dr {{doctor}}! Glad the test went smoothly. If a colleague would find this useful, a quick intro means a lot — I'll take great care of them, just like you.",
  },
  {
    key: "nudge",
    label: "Nudge stalled patient",
    body:
      "Hi Dr {{doctor}}, the patient you referred ({{detail}}) hasn't completed their test yet. A quick reminder from you usually does it — want me to follow up with them too?",
  },
];

export function fillScript(body: string, vars: { doctor?: string; me?: string; detail?: string }): string {
  return body
    .replace(/\{\{doctor\}\}/g, vars.doctor ?? "Doctor")
    .replace(/\{\{me\}\}/g, vars.me ?? "")
    .replace(/\{\{detail\}\}/g, vars.detail ?? "");
}

// 4-step activation checklist shown per doctor.
export const ACTIVATION_STEPS: { key: string; label: string }[] = [
  { key: "show_app", label: "Show them the app on your phone" },
  { key: "first_test", label: "Submit one real test together" },
  { key: "save_contact", label: "Have them save Poveon as a contact" },
  { key: "follow_up", label: "Agree a follow-up time" },
];
