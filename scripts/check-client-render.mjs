#!/usr/bin/env node
/**
 * Do the main panels actually render in a browser?
 *
 * `tsc` cannot answer this. Two whole-page crashes have shipped from this
 * repo that it was perfectly happy with:
 *
 *   - a const read above its own declaration inside an array callback, which
 *     blanked /admin ("Cannot access 'c' before initialization");
 *   - a Date typed as a Date, serialised to a string by the API, and then
 *     handed a Date method, which blanked the care plan page
 *     ("lock.unlocksOn.toLocaleDateString is not a function").
 *
 * The second one is why the fixtures below go through JSON.parse(JSON.stringify())
 * before they are used. That is not tidiness — it is the whole point. A fixture
 * written as a JavaScript object with real Dates in it would have rendered
 * perfectly and proved nothing, because the browser never sees one.
 *
 * Each scenario renders a real component with a realistic payload and fails on
 * any uncaught exception or console error. Skips cleanly (exit 0) when the
 * bundler or a browser is not available, so it never blocks someone who has
 * not installed them.
 *
 *   node scripts/check-client-render.mjs
 */
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const root = process.cwd();

function skip(why) {
  console.log(`skipped: ${why}`);
  console.log("  (npm i -D esbuild playwright-core && npx playwright install chromium)");
  process.exit(0);
}

let esbuild, chromium;
try {
  // playwright-core is CommonJS, so the named export lands on `default` when it
  // is pulled in through an ESM import.
  esbuild = await import(require.resolve("esbuild", { paths: [root] }));
  const pw = await import(require.resolve("playwright-core", { paths: [root] }));
  chromium = pw.chromium ?? pw.default?.chromium;
} catch {
  skip("esbuild and playwright-core are not installed");
}
if (!chromium) skip("playwright-core did not expose chromium");

/** Wherever this machine keeps its Chromium. */
function findChrome() {
  const explicit = process.env.CHROME_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!existsSync(base)) return null;
  for (const dir of readdirSync(base)) {
    if (!dir.startsWith("chromium-")) continue;
    const p = join(base, dir, "chrome-linux", "chrome");
    if (existsSync(p)) return p;
  }
  return null;
}
const chromePath = findChrome();
if (!chromePath) skip("no Chromium found");

// ── The scenarios ───────────────────────────────────────────────────────────
// Each is the state a panel is in when it has broken, or could.
const MEMBER = {
  id: "m1", code: "PVC-8X4K29", full_name: "Adaeze Okonkwo", email: "a@example.com",
  phone: "08031234567", sex: "female", date_of_birth: "1974-03-11",
  conditions: ["hypertension", "diabetes"], status: "active", share_history: true,
  subscribed_at: "2026-08-20T10:00:00.000Z", expires_at: "2027-08-20T10:00:00.000Z",
  messages_used: 5, message_allowance: 40, messages_left: 35,
};
const PHARMACY = {
  id: "ph1", name: "HealthPlus Ikeja", city: "Ikeja", state: "Lagos",
  address: "24 Awolowo Way", logo_url: null, phone: "0809", discount_percent: 10,
};
const BENEFITS = {
  price_naira: 2500, message_allowance: 40, lab_discount_percent: 15,
  pharmacy_discount_percent: 10, topup_price_naira: 10_000, topup_messages: 40,
};
const PRESCRIPTIONS = [
  { id: "p1", medication: "Amlodipine", form: "tablet", dosage: "10mg", frequency: "Once daily",
    duration_days: null, instructions: "In the morning", raw_text: "tabs amlodipine 10mg daily",
    start_date: "2026-07-01", end_date: null, status: "active", cancel_reason: null, stopped_note: null },
  { id: "p2", medication: "Lisinopril", form: "tablet", dosage: "5mg", frequency: "Once daily",
    duration_days: null, instructions: null, raw_text: null, start_date: null, end_date: null,
    status: "suggested", cancel_reason: null, stopped_note: null },
];

const me = (extra) => ({
  success: true, member: MEMBER,
  doctor: { name: "Dr Chidinma Eze", specialty: "Family medicine", avatar_url: null },
  messages: [], redemptions: [], prescriptions: PRESCRIPTIONS.filter((p) => p.status === "active"),
  test_orders: [], preferred_pharmacy: PHARMACY, preferred_lab: null, plan: null,
  benefits: BENEFITS, prefill: {}, ...extra,
});

const scenarios = [
  {
    name: "care plan, pharmacy locked",
    // The exact shape that crashed: a Date built on the server, stringified by
    // the API, handed to code expecting a Date.
    entry: `
      import { CarePlanPanel } from "@/components/consults/CarePlanPanel";
      export const Panel = () => <CarePlanPanel section="plan" />;`,
    routes: {
      "/api/consults/me": me({
        pharmacy_lock: { locked: true, unlocksOn: "2026-09-19T10:00:00.000Z", daysLeft: 18 },
      }),
      "/api/consults/screening": { success: true, due: false, questions: [] },
    },
    mustSay: ["HealthPlus Ikeja is your pharmacy until"],
  },
  {
    name: "care plan, pharmacy free to change",
    entry: `
      import { CarePlanPanel } from "@/components/consults/CarePlanPanel";
      export const Panel = () => <CarePlanPanel section="plan" />;`,
    routes: {
      "/api/consults/me": me({ pharmacy_lock: { locked: false, unlocksOn: null, daysLeft: 0 } }),
      "/api/consults/screening": { success: true, due: false, questions: [] },
    },
    mustSay: ["Hypertension & Diabetes care"],
  },
  {
    name: "medication tab, no pharmacy chosen",
    entry: `
      import { CarePlanPanel } from "@/components/consults/CarePlanPanel";
      export const Panel = () => <CarePlanPanel section="schedule" />;`,
    routes: {
      "/api/consults/me": me({ preferred_pharmacy: null, pharmacy_lock: { locked: false, unlocksOn: null, daysLeft: 0 } }),
      "/api/consults/medications": {
        success: true, pharmacy: null,
        medications: [{ id: "p1", medication: "Amlodipine", form: "tablet", dosage: "10mg",
          frequency: "Once daily", instructions: null, end_date: null, status: "active",
          priced: false, reason: null, covered_for: null }],
        total: { items: 0, you_pay: 0, you_save: 0, list: 0, unpriced: 1, out_of_stock: 0, covered: 0 },
        orders: [],
      },
      "/api/consults/screening": { success: true, due: false, questions: [] },
    },
    mustSay: ["Choose a pharmacy to see prices", "Amlodipine"],
  },
  {
    // The reported bug: the price could not be changed at all, because the form
    // sent back a retired ₦6,000 lump sum and the server refused any doctor
    // share above the ₦2,500 joining fee.
    name: "admin pricing saves a lower joining fee",
    entry: `
      import { PricingPanel } from "@/components/admin/AdminCarePlanTab";
      export const Panel = () => <div className="dash"><PricingPanel /></div>;`,
    routes: {
      "/api/admin/consults/settings": {
        success: true,
        settings: {
          price_naira: 2500, doctor_share_naira: 6000, message_allowance: 40,
          release_months: 12, default_doctor_cap: 200, lab_discount_percent: 15,
          pharmacy_discount_percent: 10, topup_price_naira: 10000, topup_messages: 40,
          doctor_monthly_naira: 500, bonus_pool_percent: 10,
        },
      },
    },
    mustSay: ["Commercial terms", "Per member, per month"],
    // Change the fee, save, and inspect what the form actually sent.
    act: `
      const fields = Array.from(document.querySelectorAll("input"));
      const fee = fields[0];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(fee, "3000");
      fee.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
      const save = Array.from(document.querySelectorAll("button"))
        .find((b) => /Save changes/.test(b.textContent));
      if (!save) return { error: "no enabled Save button — the form did not register a change" };
      save.click();
      await new Promise((r) => setTimeout(r, 250));
      const sent = window.__SENT__.find((r) => r.url.includes("/settings") && r.body);
      if (!sent) return { error: "the form sent nothing" };
      const body = JSON.parse(sent.body);
      if ("doctor_share_naira" in body) return { error: "the retired lump sum was sent back" };
      if (body.price_naira !== 3000) return { error: "the new fee was not sent: " + body.price_naira };
      return { ok: "sent " + JSON.stringify(body.price_naira) + " with no retired field" };
    `,
  },
  {
    name: "doctor care sections, a draft waiting",
    entry: `
      import { CarePlanOrders } from "@/components/doctor/CarePlanOrders";
      export const Panel = () => (
        <CarePlanOrders
          patientId="p1"
          prescriptions={window.__F__.prescriptions}
          testOrders={[]}
          canPrescribe
          onChanged={() => {}}
        />
      );`,
    globals: { prescriptions: PRESCRIPTIONS },
    routes: { "/api/doc-login/consults/templates": { success: true, templates: [] } },
    mustSay: ["Medication", "What they told us they take"],
  },
];

// ── Harness ─────────────────────────────────────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), "render-"));

const stubs = {
  "next/image": `import React from "react";
    export default function Image({ src, alt, width, height, className }) {
      return React.createElement("img", { src, alt, width, height, className });
    }`,
  "next/dynamic": `import React from "react";
    export default function dynamic(loader, opts) {
      return function Dyn(props) {
        const [C, setC] = React.useState(null);
        React.useEffect(() => { loader().then((m) => setC(() => m.default ?? m)); }, []);
        if (!C) return (opts && opts.loading) ? opts.loading() : null;
        return React.createElement(C, props);
      };
    }`,
  "react-hot-toast": `const noop = () => {};
    const toast = Object.assign(noop, { success: noop, error: noop, custom: noop });
    export { toast }; export default toast;`,
};

const stubPlugin = {
  name: "next-stubs",
  setup(build) {
    for (const mod of Object.keys(stubs)) {
      build.onResolve({ filter: new RegExp(`^${mod.replace("/", "\\/")}$`) }, (a) => ({
        path: a.path, namespace: "stub",
      }));
    }
    build.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
      contents: stubs[a.path], loader: "jsx", resolveDir: join(root, "src"),
    }));
  },
};

// The real Tailwind build, so a layout bug shows up as one.
let css = "";
try {
  const cssIn = join(dir, "in.css");
  const cssOut = join(dir, "out.css");
  const cfg = join(dir, "tw.config.js");
  writeFileSync(cssIn, "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  writeFileSync(cfg, `const base = require(${JSON.stringify(join(root, "tailwind.config.ts"))});
    const c = base.default ?? base;
    module.exports = { ...c, content: [${JSON.stringify(join(root, "src/**/*.{ts,tsx}"))}] };`);
  execFileSync("npx", ["tailwindcss", "-c", cfg, "-i", cssIn, "-o", cssOut], { stdio: "pipe", cwd: root });
  css = `<link rel="stylesheet" href="file://${cssOut}">`;
} catch {
  // Styles are a nice-to-have here; a crash is a crash without them.
}

const browser = await chromium.launch({ executablePath: chromePath, args: ["--no-sandbox"] });
let failures = 0;

for (const sc of scenarios) {
  const entryFile = join(dir, `entry-${scenarios.indexOf(sc)}.tsx`);
  const outFile = join(dir, `app-${scenarios.indexOf(sc)}.js`);
  writeFileSync(
    entryFile,
    `import React from "react";
     import { createRoot } from "react-dom/client";
     ${sc.entry}
     createRoot(document.getElementById("root")).render(
       <div className="min-h-dvh bg-slate-50"><div className="mx-auto max-w-3xl p-4"><Panel /></div></div>
     );`
  );

  try {
    await esbuild.build({
      entryPoints: [entryFile], outfile: outFile, bundle: true, format: "iife",
      jsx: "automatic", loader: { ".tsx": "tsx", ".ts": "ts" },
      define: { "process.env.NODE_ENV": '"development"' },
      alias: { "@": join(root, "src") }, plugins: [stubPlugin], logLevel: "warning",
      // The entry lives in a temp directory, so node resolution has to be
      // pointed back at the project's own modules — otherwise React itself is
      // unresolvable, and worse, a second copy would break hooks silently.
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    });
  } catch (e) {
    failures++;
    console.log(`FAIL ${sc.name}  did not bundle: ${String(e).split("\n")[0]}`);
    continue;
  }

  // Everything the panel fetches, answered from the fixture — after a round
  // trip through JSON, exactly as the browser would receive it.
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">${css}</head>
    <body><div id="root"></div>
    <script>
      window.__F__ = ${JSON.stringify(JSON.parse(JSON.stringify(sc.globals ?? {})))};
      const ROUTES = ${JSON.stringify(JSON.parse(JSON.stringify(sc.routes ?? {})))};
      window.__SENT__ = [];
      window.fetch = (url, init) => {
        window.__SENT__.push({ url: String(url), body: init && init.body });
        const path = String(url).split("?")[0];
        const hit = Object.keys(ROUTES).find((k) => path === k || path.endsWith(k));
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(hit ? ROUTES[hit] : { success: true }),
        });
      };
    </script>
    <script src="file://${outFile}"></script></body></html>`;
  const pageFile = join(dir, `page-${scenarios.indexOf(sc)}.html`);
  writeFileSync(pageFile, html);

  for (const [w, h] of [[390, 844], [1024, 900]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().split("\n")[0].slice(0, 160)); });

    await page.goto(`file://${pageFile}`);
    await page.waitForTimeout(900);

    const text = await page.evaluate(() => document.getElementById("root")?.innerText ?? "");

    // Some panels are only interesting once something has been done to them.
    let acted = null;
    if (sc.act) {
      acted = await page.evaluate(`(async () => { ${sc.act} })()`);
      if (acted?.error) errors.push(`action: ${acted.error}`);
    }
    const wide = await page.evaluate(() => {
      const doc = document.documentElement;
      if (doc.scrollWidth <= doc.clientWidth + 1) return null;
      // Name the widest offender, or the report is unactionable.
      let worst = null;
      document.querySelectorAll("*").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > doc.clientWidth + 1 && (!worst || r.right > worst.right)) {
          worst = {
            right: Math.round(r.right),
            width: Math.round(r.width),
            tag: el.tagName.toLowerCase(),
            cls: String(el.className).slice(0, 70),
            text: (el.textContent ?? "").trim().slice(0, 40),
          };
        }
      });
      return { scrollW: doc.scrollWidth, clientW: doc.clientWidth, worst };
    });
    const missing = (sc.mustSay ?? []).filter((phrase) => !text.includes(phrase));

    const ok = errors.length === 0 && text.trim().length > 0 && !wide && missing.length === 0;
    if (!ok) failures++;
    console.log(
      (ok ? "ok   " : "FAIL ") + `${sc.name} @${w}` +
      (text.trim() ? "" : "  rendered nothing") +
      (wide ? `  scrolls sideways ${wide.scrollW}/${wide.clientW}` : "") +
      (missing.length ? `  missing: ${missing.map((m) => JSON.stringify(m)).join(", ")}` : "") +
      (acted?.ok ? `  ${acted.ok}` : "")
    );
    if (wide?.worst) {
      console.log(`       widest: <${wide.worst.tag} class="${wide.worst.cls}"> right=${wide.worst.right} w=${wide.worst.width}  "${wide.worst.text}"`);
    }
    for (const e of errors.slice(0, 2)) console.log(`       ${e}`);
    await page.close();
  }
}

await browser.close();

if (failures) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log("\nEvery panel renders, says what it must, and throws nothing.");
