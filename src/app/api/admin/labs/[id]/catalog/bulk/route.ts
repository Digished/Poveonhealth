export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { processJob } from "@/lib/synonym-job-processor";
import { resend, labSender } from "@/lib/email/resend";

async function syncSynonymsToKb(rawName: string, newSyns: string[]) {
  const existingKb = await prisma.kbTest.findFirst({
    where: { canonical_name: { equals: rawName, mode: "insensitive" } },
    select: { id: true, synonyms: true },
  });
  if (!existingKb) return;
  const current = Array.isArray(existingKb.synonyms) ? (existingKb.synonyms as string[]) : [];
  const merged = Array.from(new Set([...current, ...newSyns]));
  if (merged.length !== current.length) {
    await prisma.kbTest.update({ where: { id: existingKb.id }, data: { synonyms: merged } });
  }
}

const BulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: z.array(z.string()).min(1) }),
  z.object({
    action: z.literal("set_commission"),
    ids: z.array(z.string()).min(1),
    commission_pct: z.number().min(0).max(100),
  }),
  z.object({
    action: z.literal("set_synonyms"),
    ids: z.array(z.string()).min(1),
    synonyms: z.array(z.string()),
  }),
  z.object({ action: z.literal("generate_synonyms"), ids: z.array(z.string()).min(1) }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  // ── delete ────────────────────────────────────────────────────────────────
  if (parsed.data.action === "delete") {
    const { count } = await prisma.labOfferedTest.deleteMany({
      where: { id: { in: parsed.data.ids }, lab_id: id },
    });
    return NextResponse.json({ success: true, deleted: count });
  }

  // ── set_commission ────────────────────────────────────────────────────────
  if (parsed.data.action === "set_commission") {
    const { ids, commission_pct } = parsed.data;

    const tests = await prisma.labOfferedTest.findMany({
      where: { id: { in: ids }, lab_id: id },
      select: { id: true, lab_price: true },
    });

    // No transaction — each row updated independently so no timeout risk
    let updated = 0;
    for (const t of tests) {
      await prisma.labOfferedTest.update({
        where: { id: t.id },
        data: {
          commission_pct,
          poveon_fee: parseFloat(((Number(t.lab_price) * commission_pct) / 100).toFixed(2)),
        },
      });
      updated++;
    }

    return NextResponse.json({ success: true, updated });
  }

  // ── set_synonyms ──────────────────────────────────────────────────────────
  if (parsed.data.action === "set_synonyms") {
    const { ids, synonyms } = parsed.data;

    const tests = await prisma.labOfferedTest.findMany({
      where: { id: { in: ids }, lab_id: id },
      select: { id: true, raw_name: true },
    });

    let updated = 0;
    for (const t of tests) {
      await prisma.labOfferedTest.update({
        where: { id: t.id },
        data: { synonyms },
      });
      await syncSynonymsToKb(t.raw_name, synonyms);
      updated++;
    }

    return NextResponse.json({ success: true, updated });
  }

  // ── generate_synonyms ─────────────────────────────────────────────────────
  if (parsed.data.action === "generate_synonyms") {
    const { ids } = parsed.data;
    const adminEmail = (admin as any)?.email || "admin@poveon.com";

    const tests = await prisma.labOfferedTest.findMany({
      where: { id: { in: ids }, lab_id: id },
      select: { id: true, raw_name: true, category_label: true },
    });

    if (tests.length === 0) {
      return NextResponse.json({ success: true, jobId: null, message: "No tests to process" });
    }

    // Create a database-driven job for tracking
    const job = await prisma.labSynonymGenerationJob.create({
      data: {
        lab_id: id,
        total_tests: tests.length,
        initiated_by: adminEmail,
        test_results: {
          createMany: {
            data: tests.map((t) => ({
              test_id: t.id,
              status: "pending",
            })),
          },
        },
      },
    });

    // Return immediately with jobId so client can check progress anytime
    // The actual generation happens in the background
    (async () => {
      try {
        console.log(`[synonym-gen] Started job ${job.id} for lab ${id} with ${tests.length} tests`);

        // Process the job
        await processJob(job.id);

        // After job completes, send notification email
        const lab = await prisma.lab.findUnique({
          where: { id },
          select: { name: true, request_email: true },
        });

        if (lab?.request_email) {
          try {
            await resend.emails.send({
              from: labSender(lab),
              to: lab.request_email,
              subject: `AI Synonyms Generation Complete`,
              html: `
                <h2>Synonym Generation Complete</h2>
                <p>The AI synonym generation for ${tests.length} tests has been completed.</p>
                <p>Status: The test catalog has been updated with AI-generated synonyms.</p>
                <p>You can now use these synonyms to improve test matching and discovery.</p>
              `,
            });
          } catch (emailErr) {
            console.error(`[synonym-gen] Failed to send completion email:`, emailErr);
          }
        }

        console.log(`[synonym-gen] Completed job ${job.id}`);
      } catch (error) {
        console.error(`[synonym-gen] Error processing job ${job.id}:`, error);
        await prisma.labSynonymGenerationJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            error_message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    })();

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Synonym generation started. This may take several minutes. You can check progress anytime.",
    });
  }
}
