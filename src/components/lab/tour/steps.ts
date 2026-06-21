/**
 * Ordered steps for the lab dashboard guided tour. Each step is anchored to a
 * button via its `data-tour` attribute; when that target isn't on screen (e.g.
 * a drawer-only button), the spotlight falls back to a centered explainer card
 * so the whole client journey is still taught end-to-end.
 */
export interface TourStep {
  /** Matches the `data-tour="<key>"` attribute on the highlighted element. */
  key: string;
  title: string;
  body: string;
  /** Where to find the button, shown when its target isn't currently visible. */
  where?: string;
}

export const LAB_TOUR_KEY = "poveon_lab_tutorial_v1";

export const LAB_TOUR_STEPS: TourStep[] = [
  {
    key: "ob-poveon-code",
    title: "1. Check in a Poveon client",
    body: "When a client arrives with a Poveon code, type it here and press Reveal to pull up their request instantly.",
    where: "Onboarding → Register tab",
  },
  {
    key: "ob-walkin",
    title: "2. Register a walk-in",
    body: "No code? Use “Register walk-in” to capture the client’s details, tests and referring doctor by hand.",
    where: "Onboarding → Register tab",
  },
  {
    key: "ob-edit-details",
    title: "3. Confirm client details",
    body: "Open a client to review and correct their name, age, sex, phone and email before anything else.",
    where: "Open any client in the Register list",
  },
  {
    key: "ob-edit-tests",
    title: "4. Edit the tests",
    body: "Add or remove the investigations the client is actually doing. Tests auto-route to Laboratory or Radiology.",
    where: "Inside the client’s registration checklist",
  },
  {
    key: "ob-confirm-tests",
    title: "5. Confirm the tests",
    body: "Once the test list is right, tick “Confirm tests”. This unlocks payment.",
    where: "Inside the client’s registration checklist",
  },
  {
    key: "ob-mark-paid",
    title: "6. Mark as paid",
    body: "Collect payment, then press “Mark as paid”. The client now moves into the workstation pipeline.",
    where: "Inside the client’s registration checklist",
  },
  {
    key: "ob-direct",
    title: "7. Direct the client",
    body: "After payment, send the client where they need to go — Laboratory for sample collection, or Radiology to schedule a scan.",
    where: "Inside the client’s registration checklist",
  },
  {
    key: "ws-advance",
    title: "8. Move the pipeline forward",
    body: "In the Workstation, advance each department track step by step — collect, receive, analyse, verify, report.",
    where: "Workstation → open a paid request",
  },
  {
    key: "ws-results",
    title: "9. Enter & send results",
    body: "Attach a result document or link and send it to the patient. Sent and still-pending results show on the pipeline.",
    where: "Workstation → open a request",
  },
  {
    key: "dept-ai",
    title: "10. Auto-build departments",
    body: "Setting up a department? Describe what it does and let AI generate the routing keywords for you.",
    where: "Departments tab",
  },
];
