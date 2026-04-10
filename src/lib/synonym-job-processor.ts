import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function generateSynonyms(testName: string, categoryLabel?: string | null): Promise<string[]> {
  if (!openai) {
    console.log(`[generateSynonyms] No OpenAI API key configured`);
    return [testName];
  }

  const startTime = Date.now();
  try {
    console.log(`[generateSynonyms] Starting request for: "${testName}"`);

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
      timeout: 30000, // 30 second timeout
    } as any);

    const duration = Date.now() - startTime;
    console.log(`[generateSynonyms] Success for "${testName}" in ${duration}ms`);

    const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as { synonyms?: string[] };
    const result = Array.from(new Set([testName, ...(parsed.synonyms ?? [])]));
    console.log(`[generateSynonyms] Generated ${result.length} synonyms: ${result.join(", ")}`);
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[generateSynonyms] FAILED for "${testName}" after ${duration}ms: ${errorMsg}`, err);
    throw err; // Re-throw so we can see the actual error
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
 * Process a single test's synonym generation
 */
async function processSingleTest(
  testId: string,
  testName: string,
  categoryLabel: string | null | undefined,
  jobId: string
): Promise<void> {
  const resultRecord = await prisma.labSynonymGenerationTestResult.findUnique({
    where: { job_id_test_id: { job_id: jobId, test_id: testId } },
    select: { id: true },
  });

  if (!resultRecord) {
    console.error(`[processSingleTest] Test result not found for ${testName}`);
    return;
  }

  try {
    // Mark as processing
    await prisma.labSynonymGenerationTestResult.update({
      where: { id: resultRecord.id },
      data: { status: "processing", last_attempted_at: new Date() },
    });

    // Generate synonyms via OpenAI
    const synonyms = await generateSynonyms(testName, categoryLabel);

    // Update test and mark as completed
    await prisma.labOfferedTest.update({
      where: { id: testId },
      data: { synonyms },
    });

    await syncSynonymsToKb(testName, synonyms);

    await prisma.labSynonymGenerationTestResult.update({
      where: { id: resultRecord.id },
      data: {
        status: "completed",
        generated_synonyms: synonyms,
        completed_at: new Date(),
      },
    });

    console.log(`[processSingleTest] ✓ Completed: ${testName}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[processSingleTest] ✗ Failed: ${testName} - ${errorMsg}`);

    // Mark as failed so we can see what went wrong
    try {
      await prisma.labSynonymGenerationTestResult.update({
        where: { id: resultRecord.id },
        data: {
          status: "failed",
          error_message: errorMsg,
          completed_at: new Date(),
        },
      });
    } catch (updateError) {
      console.error(`[processSingleTest] Failed to mark test as failed:`, updateError);
    }
  }
}

/**
 * Process all pending tests for a job — called periodically or triggered
 */
export async function processJob(jobId: string): Promise<void> {
  const job = await prisma.labSynonymGenerationJob.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, total_tests: true },
  });

  if (!job || job.status === "completed" || job.status === "failed") {
    return;
  }

  // Fetch pending/processing tests
  const pendingTestResults = await prisma.labSynonymGenerationTestResult.findMany({
    where: { job_id: jobId, status: { in: ["pending", "processing"] } },
    select: {
      id: true,
      test_id: true,
    },
    take: 100, // Process in batches of 100 to avoid memory issues
  });

  if (pendingTestResults.length === 0) {
    // Count actual completed/failed from database
    const completedCount = await prisma.labSynonymGenerationTestResult.count({
      where: { job_id: jobId, status: "completed" },
    });
    const failedCount = await prisma.labSynonymGenerationTestResult.count({
      where: { job_id: jobId, status: "failed" },
    });

    // Update job to completed
    await prisma.labSynonymGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        completed_tests: completedCount,
        failed_tests: failedCount,
        completed_at: new Date(),
      },
    });
    console.log(`[synonym-gen] Job ${jobId} completed: ${completedCount} succeeded, ${failedCount} failed`);
    return;
  }

  // Fetch all test info upfront to minimize DB connections during processing
  const testIds = pendingTestResults.map((t) => t.test_id);
  const tests = await prisma.labOfferedTest.findMany({
    where: { id: { in: testIds } },
    select: { id: true, raw_name: true, category_label: true },
  });
  const testMap = new Map(tests.map((t) => [t.id, t]));

  // Process each test
  console.log(`[synonym-gen] Processing ${pendingTestResults.length} tests`);

  for (const testResult of pendingTestResults) {
    const test = testMap.get(testResult.test_id);

    if (!test) {
      console.warn(`[synonym-gen] Test not found: ${testResult.test_id}`);
      await prisma.labSynonymGenerationTestResult.update({
        where: { id: testResult.id },
        data: {
          status: "failed",
          error_message: "Test not found",
          completed_at: new Date(),
        },
      });
      continue;
    }

    await processSingleTest(testResult.test_id, test.raw_name, test.category_label, jobId);

    // Update progress after each test
    const completedCount = await prisma.labSynonymGenerationTestResult.count({
      where: { job_id: jobId, status: "completed" },
    });
    const failedCount = await prisma.labSynonymGenerationTestResult.count({
      where: { job_id: jobId, status: "failed" },
    });
    const percent = Math.round(((completedCount + failedCount) / job.total_tests) * 100);

    await prisma.labSynonymGenerationJob.update({
      where: { id: jobId },
      data: {
        completed_tests: completedCount,
        failed_tests: failedCount,
      },
    });

    console.log(`[synonym-gen] Progress: ${percent}% (${completedCount} completed, ${failedCount} failed)`);

    // Delay between API calls
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Final progress update
  const completedCount = await prisma.labSynonymGenerationTestResult.count({
    where: { job_id: jobId, status: "completed" },
  });
  const failedCount = await prisma.labSynonymGenerationTestResult.count({
    where: { job_id: jobId, status: "failed" },
  });

  await prisma.labSynonymGenerationJob.update({
    where: { id: jobId },
    data: {
      completed_tests: completedCount,
      failed_tests: failedCount,
    },
  });

  console.log(`[synonym-gen] Job ${jobId} batch complete: ${completedCount} completed, ${failedCount} failed`);
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
