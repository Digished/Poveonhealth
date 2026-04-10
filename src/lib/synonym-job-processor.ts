import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function generateSynonyms(testName: string, categoryLabel?: string | null): Promise<string[]> {
  if (!openai) return [testName];
  try {
    const controller = new AbortController();
    // Reduced timeout: 5 seconds for serverless environment with limited connection pool
    const timeoutId = setTimeout(() => controller.abort(), 5000);

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
  let resultId: string | null = null;
  try {
    // Fetch result info
    const result = await prisma.labSynonymGenerationTestResult.findUnique({
      where: { job_id_test_id: { job_id: jobId, test_id: testId } },
      select: { id: true, retry_count: true, max_retries: true, status: true },
    });

    if (!result) {
      console.error(`[processSingleTest] Test result not found for job ${jobId}, test ${testId}`);
      return { success: false, error: "Test result record not found" };
    }

    resultId = result.id;

    // Check if max retries exceeded
    if (result.status === "failed" && result.retry_count >= result.max_retries) {
      console.warn(`[processSingleTest] Max retries exceeded for test ${testName} (${testId})`);
      return { success: false, error: "Max retries exceeded" };
    }

    console.log(`[processSingleTest] Processing test: ${testName} (${testId})`);

    // Mark as processing
    await prisma.labSynonymGenerationTestResult.update({
      where: { id: resultId },
      data: {
        status: "processing",
        last_attempted_at: new Date(),
        retry_count: result.retry_count + 1,
      },
    });

    // Generate synonyms (don't hold DB connection during this long operation)
    let synonyms: string[] = [];
    try {
      synonyms = await generateSynonyms(testName, categoryLabel);
      console.log(`[processSingleTest] Generated ${synonyms.length} synonyms for ${testName}`);
    } catch (apiError) {
      // If API fails, treat as a failed attempt
      throw apiError;
    }

    // Update all at once to minimize DB connections
    // Batch: update test, sync to KB, mark as completed
    await prisma.labOfferedTest.update({
      where: { id: testId },
      data: { synonyms },
    });

    await syncSynonymsToKb(testName, synonyms);

    await prisma.labSynonymGenerationTestResult.update({
      where: { id: resultId },
      data: {
        status: "completed",
        generated_synonyms: synonyms,
        completed_at: new Date(),
      },
    });

    return { success: true, synonyms };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[processSingleTest] Error processing ${testName}: ${errorMsg}`);

    if (resultId) {
      try {
        // Fetch fresh retry count
        const result = await prisma.labSynonymGenerationTestResult.findUnique({
          where: { id: resultId },
          select: { retry_count: true, max_retries: true },
        });

        if (result) {
          const willRetry = result.retry_count < result.max_retries;
          await prisma.labSynonymGenerationTestResult.update({
            where: { id: resultId },
            data: {
              status: willRetry ? "pending" : "failed",
              error_message: errorMsg,
            },
          });
        }
      } catch (updateError) {
        console.error(`[processSingleTest] Failed to update result status: ${updateError}`);
      }
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

  // Process each test with a small delay between API calls
  let processed = 0;
  for (const testResult of pendingTestResults) {
    const test = testMap.get(testResult.test_id);

    if (!test) {
      await prisma.labSynonymGenerationTestResult.update({
        where: { id: testResult.id },
        data: {
          status: "failed",
          error_message: "Test not found",
          completed_at: new Date(),
        },
      });
      console.warn(`[synonym-gen] Test ${testResult.test_id} not found`);
      continue;
    }

    await processSingleTest(testResult.test_id, test.raw_name, test.category_label, jobId);
    processed++;

    // Update progress every 5 tests to reduce DB load
    if (processed % 5 === 0) {
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

      console.log(`[synonym-gen] Job ${jobId} progress: ${completedCount} completed, ${failedCount} failed`);
    }

    // Small delay between API calls to prevent rate limiting and connection pool exhaustion
    await new Promise((resolve) => setTimeout(resolve, 300));
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
