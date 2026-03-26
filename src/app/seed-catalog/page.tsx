"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

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

type RowState = { status: "pending" | "running" | "done" | "error"; tests?: number; synonyms?: number };

function SeedPage() {
  const params = useSearchParams();
  const secret = params.get("secret") ?? "";
  const [rows, setRows] = useState<Record<string, RowState>>(
    Object.fromEntries(SLUGS.map((s) => [s, { status: "pending" }]))
  );
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);

  async function start() {
    setStarted(true);
    for (const slug of SLUGS) {
      setRows((r) => ({ ...r, [slug]: { status: "running" } }));
      try {
        const res = await fetch(`/api/run-seed?secret=${secret}&slug=${slug}`);
        const data = await res.json();
        if (!res.ok || data.success === false) throw new Error(data.error ?? "failed");
        setRows((r) => ({ ...r, [slug]: { status: "done", tests: data.tests, synonyms: data.synonyms } }));
      } catch {
        setRows((r) => ({ ...r, [slug]: { status: "error" } }));
      }
    }
    setFinished(true);
  }

  const total = Object.values(rows).reduce((a, r) => a + (r.tests ?? 0), 0);

  return (
    <div style={{ fontFamily: "monospace", padding: 40, maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Test Catalog Seed</h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        Seeds all 24 categories one at a time. Do not close this tab while running.
      </p>

      <button
        onClick={start}
        disabled={started}
        style={{
          padding: "12px 28px",
          fontSize: 15,
          cursor: started ? "not-allowed" : "pointer",
          background: started ? "#ccc" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          marginBottom: 32,
          opacity: started ? 0.6 : 1,
        }}
      >
        {started && !finished ? "Seeding... please wait" : finished ? "Done!" : "Start Seeding"}
      </button>

      <div style={{ lineHeight: 2.2, fontSize: 14 }}>
        {SLUGS.map((slug) => {
          const row = rows[slug];
          const icon = row.status === "running" ? "⏳" : row.status === "done" ? "✅" : row.status === "error" ? "❌" : "○";
          return (
            <div key={slug} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f0f0f0" }}>
              <span>{icon} {slug}</span>
              {row.status === "done" && (
                <span style={{ color: "#888" }}>{row.tests} tests · {row.synonyms} synonyms</span>
              )}
              {row.status === "error" && <span style={{ color: "red" }}>failed — will retry on re-run</span>}
            </div>
          );
        })}
      </div>

      {finished && (
        <div style={{ marginTop: 32, padding: 20, background: "#f0fff4", border: "1px solid #86efac", borderRadius: 8 }}>
          <strong>Seeding complete!</strong>
          <div style={{ marginTop: 8 }}>Total tests seeded: <strong>{total}</strong></div>
          <div style={{ marginTop: 4, color: "#666", fontSize: 13 }}>
            You can now close this tab and tell Claude it is done.
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 40, fontFamily: "monospace" }}>Loading...</div>}>
      <SeedPage />
    </Suspense>
  );
}
