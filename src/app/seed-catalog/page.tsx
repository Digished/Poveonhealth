"use client";

/**
 * ONE-TIME catalog seed page.
 * DELETE this file and src/app/api/run-seed after seeding is confirmed.
 * Access at /seed-catalog?secret=poveon-seed
 */

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const SLUGS = [
  "hematology","coagulation-haemostasis","clinical-chemistry-biochemistry",
  "endocrinology-hormones","immunology-autoimmune","tumour-markers-oncology",
  "virology-serology","microbiology-culture","tb-mycobacteriology",
  "parasitology","molecular-genetic-diagnostics","urinalysis",
  "stool-faecal-tests","body-fluids-analysis","histopathology-cytology",
  "blood-banking-transfusion","toxicology-drug-testing","others-uncategorized",
  "x-ray","ultrasound-echocardiography","ct-scan","mri",
  "nuclear-medicine-pet","special-imaging",
];

type Status = "pending" | "running" | "done" | "error";
type Result = { tests: number; synonyms: number } | null;

function SeedPage() {
  const params = useSearchParams();
  const secret = params.get("secret") ?? "";

  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const runSeed = useCallback(async () => {
    if (!secret) return;
    setRunning(true);
    setDone(false);

    for (const slug of SLUGS) {
      setStatuses((s) => ({ ...s, [slug]: "running" }));
      try {
        const res = await fetch(`/api/run-seed?secret=${secret}&slug=${slug}`);
        const data = await res.json();
        if (data.success === false) throw new Error(data.error);
        setStatuses((s) => ({ ...s, [slug]: "done" }));
        setResults((r) => ({ ...r, [slug]: { tests: data.tests, synonyms: data.synonyms } }));
      } catch {
        setStatuses((s) => ({ ...s, [slug]: "error" }));
        setResults((r) => ({ ...r, [slug]: null }));
      }
    }

    setRunning(false);
    setDone(true);
  }, [secret]);

  const icon = (slug: string) => {
    const s = statuses[slug];
    if (s === "running") return "⏳";
    if (s === "done") return "✅";
    if (s === "error") return "❌";
    return "○";
  };

  const totalTests = Object.values(results).reduce((a, r) => a + (r?.tests ?? 0), 0);
  const totalSynonyms = Object.values(results).reduce((a, r) => a + (r?.synonyms ?? 0), 0);

  if (!secret || secret !== "poveon-seed") {
    return (
      <div style={{ fontFamily: "monospace", padding: 40, color: "#f00" }}>
        Missing or invalid secret. Add <code>?secret=poveon-seed</code> to the URL.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "monospace", padding: 40, maxWidth: 600, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 8 }}>Catalog Seed</h2>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Seeds all 24 test categories one at a time. Do not close this tab.
      </p>

      {!running && !done && (
        <button
          onClick={runSeed}
          style={{ padding: "10px 24px", fontSize: 16, cursor: "pointer", marginBottom: 32 }}
        >
          Start Seeding
        </button>
      )}

      <div style={{ lineHeight: 2 }}>
        {SLUGS.map((slug) => (
          <div key={slug} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{icon(slug)} {slug}</span>
            {results[slug] && (
              <span style={{ color: "#888" }}>
                {results[slug]!.tests} tests · {results[slug]!.synonyms} synonyms
              </span>
            )}
            {statuses[slug] === "error" && <span style={{ color: "#f00" }}>failed</span>}
          </div>
        ))}
      </div>

      {done && (
        <div style={{ marginTop: 32, padding: 16, background: "#f0fff0", borderRadius: 8 }}>
          <strong>Done!</strong>
          <div>Total tests: {totalTests}</div>
          <div>Total synonyms: {totalSynonyms}</div>
          <div style={{ marginTop: 8, color: "#666", fontSize: 13 }}>
            You can now delete /seed-catalog and /api/run-seed
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <SeedPage />
    </Suspense>
  );
}
