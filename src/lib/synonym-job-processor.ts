import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function generateSynonyms(testName: string, categoryLabel?: string | null): Promise<string[]> {
  if (!openai) return [testName];
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: 'Return JSON: { "synonyms": string[] }' },
          {
            role: "user",
            content: `Generate 5-7 common synonyms, abbreviations, and alternate names for this medical lab test: "${testName}"${categoryLabel ? ` (category: ${categoryLabel})` : ""}. Include the original name. Return as array.`,
          },
        ],
      } as any, { signal: controller.signal });

      clearTimeout(timeoutId);
      const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as { synonyms?: string[] };
      return Array.from(new Set([testName, ...(parsed.synonyms ?? [])]));
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.error(`Synonym generation failed for "${testName}":`, err);
    throw err;
  }
}

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

/**
 * Process a single test's synonym generation with retry logic
 */
async function processSingleTest(
  testId: string,
  testName: string,
  categoryLabel: string | null | undefined,
  jobId: string
): Promise<{ success: boolean; synonyms?: string[]; error?: string }> {
  try {
    const result = await prisma.labSynonymGenerationTestResult.findUnique({
      where: { job_id_test_id: { job_id: jobId, test_id: testId } },
      select: { id: true, retry_count: true, max_retries: true, status: true },
    });

    if (!result) {
      return { success: false, error: "Test result record not found" };
    }

    // Check if max retries exceeded
    if (result.status === "failed" && result.retry_count >= result.max_retries) {
      return { success: false, error: "Max retries exceeded" };
    }

    // Mark as processing
    await prisma.labSynonymGenerationTestResult.update({
      where: { id: result.id },
      data: {
        status: "processing",
        last_attempted_at: new Date(),
        retry_count: result.retry_count + 1,
      },
    });

    // Generate synonyms
    const synonyms = await generateSynonyms(testName, categoryLabel);

    // Update test with new synonyms
    await prisma.labOfferedTest.update({
      where: { id: testId },
      data: { synonyms },
    });

    // Sync to KB
    await syncSynonymsToKb(testName, synonyms);

    // Mark as completed
    await prisma.labSynonymGenerationTestResult.update({
      where: { id: result.id },
      data: {
        status: "completed",
        generated_synonyms: synonyms,
        completed_at: new Date(),
      },
    });

    return { success: true, synonyms };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const result = await prisma.labSynonymGenerationTestResult.findUnique({
      where: { job_id_test_id: { job_id: jobId, test_id: testId } },
      select: { id: true, retry_count: true, max_retries: true },
    });

    if (result) {
      const willRetry = result.retry_count < result.max_retries;
      await prisma.labSynonymGenerationTestResult.update({
        where: { id: result.id },
        data: {
          status: willRetry ? "pending" : "failed",
          error_message: errorMsg,
        },
      });
    }

    return { success: false, error: errorMsg };
  }
}

/**
 * Process all pending tests for a job — called periodically or triggered
 */
export async function processJob(jobId: string): Promise<void> {
  const job = await prisma.labSynonymGenerationJob.findUnique({
    where: { id: jobId },
    include: {
      test_results: {
        where: { status: { in: ["pending", "processing"] } },
        include: {
          // We'll fetch test info separately
        },
      },
    },
  });

  if (!job || job.status === "completed" || job.status === "failed") {
    return;
  }

  let completed = job.completed_tests;
  let failed = job.failed_tests;

  // Process each pending/processing test
  for (const testResult of job.test_results) {
    const test = await prisma.labOfferedTest.findUnique({
      where: { id: testResult.test_id },
      select: { raw_name: true, category_label: true },
    });

    if (!test) {
      await prisma.labSynonymGenerationTestResult.update({
        where: { id: testResult.id },
        data: {
          status: "failed",
          error_message: "Test not found",
          completed_at: new Date(),
        },
      });
      failed++;
      continue;
    }

    const result = await processSingleTest(testResult.test_id, test.raw_name, test.category_label, jobId);

    if (!result.success) {
      const testResult2 = await prisma.labSynonymGenerationTestResult.findUnique({
        where: { job_id_test_id: { job_id: jobId, test_id: testResult.test_id } },
        select: { retry_count: true, max_retries: true, status: true },
      });
      if (testResult2?.status === "failed") {
        failed++;
      }
    } else {
      completed++;
    }
  }

  // Check if job is complete
  const remainingTests = await prisma.labSynonymGenerationTestResult.count({
    where: { job_id: jobId, status: { in: ["pending", "processing"] } },
  });

  if (remainingTests === 0) {
    // Job is done
    await prisma.labSynonymGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        completed_tests: completed,
        failed_tests: failed,
        completed_at: new Date(),
      },
    });
  } else {
    // Update progress
    await prisma.labSynonymGenerationJob.update({
      where: { id: jobId },
      data: {
        completed_tests: completed,
        failed_tests: failed,
      },
    });
  }
}

/**
 * Find and process all incomplete jobs (called from a cron job or periodic trigger)
 */
export async function processAllIncompleteJobs(): Promise<void> {
  const incompleteJobs = await prisma.labSynonymGenerationJob.findMany({
    where: { status: { in: ["processing"] } },
    select: { id: true },
  });

  for (const job of incompleteJobs) {
    try {
      await processJob(job.id);
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
    }
  }
}
