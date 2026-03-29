export const dynamic = "force-dynamic";
/**
 * POST /api/lab/sheets/confirm
 *
 * Applies the diff returned by /pull to the Poveon database:
 *   - added   → creates new LabOfferedTest rows, then generates synonyms async
 *   - changed → updates lab_price / is_active, writes PriceChangeLog entries
 *   - removed → sets is_active = false
 *
 * Expects body: { added, changed, removed } — same shape as /pull response.
 *
 * Access: lab owner OR member with can_manage_price_list
 */

import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

// ── Synonym generation (same logic as admin catalog route) ────────────────────

async function generateSynonyms(testName: string, categoryLabel?: string): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) return [testName];
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: 'Return JSON: { "synonyms": string[] }' },
        {
          role: "user",
          content: `Generate 4–8 common synonyms, abbreviations, and alternate names for this medical lab test: "${testName}"${categoryLabel ? ` (category: ${categoryLabel})` : ""}. Nigerian medical context. Include the original name.`,
        },
      ],
    });
    const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as { synonyms?: string[] };
    return Array.from(new Set([testName, ...(parsed.synonyms ?? [])]));
  } catch {
    return [testName];
  }
}

async function getDefaultCommission(): Promise<number> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "default_commission_pct" } });
  return setting ? parseFloat(setting.value) : 15;
}

// ── Types matching /pull response ─────────────────────────────────────────────

type AddedItem   = { raw_name: string; lab_price: number; category: string };
type ChangedItem = { id: string; raw_name: string; old_price?: number; new_price?: number; old_active?: boolean; new_active?: boolean };
type RemovedItem = { id: string; raw_name: string };

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (auth.auth_method === "member" && !auth.permissions.can_manage_price_list) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (auth.auth_method === "api_key") {
    return NextResponse.json({ error: "Sheets operations require a browser session" }, { status: 403 });
  }

  const body = await request.json() as {
    added:   AddedItem[];
    changed: ChangedItem[];
    removed: RemovedItem[];
  };

  const actorEmail = auth.actor_email ?? "sheets-sync";
  const actorRole  = auth.auth_method === "member" ? "member" : "owner";
  const labId      = auth.lab_id;

  const commission_pct = await getDefaultCommission();

  // ── Apply: changed ──────────────────────────────────────────────────────────
  for (const item of body.changed) {
    const updateData: Record<string, unknown> = {};
    const logEntries: Parameters<typeof prisma.priceChangeLog.create>[0]["data"][] = [];

    if (item.new_price !== undefined && item.old_price !== undefined) {
      const poveon_fee = parseFloat(((item.new_price * commission_pct) / 100).toFixed(2));
      updateData.lab_price  = item.new_price;
      updateData.poveon_fee = poveon_fee;
      logEntries.push({
        lab_offered_test_id: item.id,
        lab_id: labId,
        test_name: item.raw_name,
        changed_by_email: actorEmail,
        changed_by_role: actorRole,
        field_changed: "lab_price",
        old_value: String(item.old_price),
        new_value: String(item.new_price),
        old_price: item.old_price,
        new_price: item.new_price,
      });
    }

    if (item.new_active !== undefined && item.old_active !== undefined) {
      updateData.is_active = item.new_active;
      logEntries.push({
        lab_offered_test_id: item.id,
        lab_id: labId,
        test_name: item.raw_name,
        changed_by_email: actorEmail,
        changed_by_role: actorRole,
        field_changed: "is_active",
        old_value: String(item.old_active),
        new_value: String(item.new_active),
      });
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.labOfferedTest.update({
        where: { id: item.id },
        data: updateData,
      });
      for (const entry of logEntries) {
        await prisma.priceChangeLog.create({ data: entry });
      }
    }
  }

  // ── Apply: removed (deactivate, don't delete) ───────────────────────────────
  for (const item of body.removed) {
    await prisma.labOfferedTest.update({
      where: { id: item.id },
      data: { is_active: false },
    });
    await prisma.priceChangeLog.create({
      data: {
        lab_offered_test_id: item.id,
        lab_id: labId,
        test_name: item.raw_name,
        changed_by_email: actorEmail,
        changed_by_role: actorRole,
        field_changed: "is_active",
        old_value: "true",
        new_value: "false",
      },
    });
  }

  // ── Apply: added ────────────────────────────────────────────────────────────
  const newTestIds: { id: string; raw_name: string; category: string }[] = [];

  for (const item of body.added) {
    const poveon_fee = parseFloat(((item.lab_price * commission_pct) / 100).toFixed(2));
    const test = await prisma.labOfferedTest.upsert({
      where: { lab_id_raw_name: { lab_id: labId, raw_name: item.raw_name } },
      create: {
        lab_id: labId,
        raw_name: item.raw_name,
        category_label: item.category || null,
        lab_price: item.lab_price,
        poveon_fee,
        commission_pct,
        is_active: true,
        synonyms: [item.raw_name],
      },
      update: {
        // If it already exists but was inactive, reactivate with new price
        lab_price: item.lab_price,
        poveon_fee,
        is_active: true,
        category_label: item.category || null,
      },
    });
    newTestIds.push({ id: test.id, raw_name: item.raw_name, category: item.category });
  }

  // Update sync timestamp
  await prisma.lab.update({
    where: { id: labId },
    data: {
      sheet_last_synced_at: new Date(),
      sheet_sync_status: "synced",
    },
  });

  // Log activity
  const totalChanges = body.added.length + body.changed.length + body.removed.length;
  if (totalChanges > 0) {
    await prisma.labActivity.create({
      data: {
        lab_id: labId,
        actor_email: actorEmail,
        actor_role: actorRole,
        action: "sheets_sync",
        detail: `Synced from Google Sheets: ${body.added.length} added, ${body.changed.length} updated, ${body.removed.length} deactivated`,
      },
    });
  }

  // Generate synonyms for new tests in the background (fire-and-forget)
  if (newTestIds.length > 0) {
    Promise.all(
      newTestIds.map(async ({ id, raw_name, category }) => {
        const synonyms = await generateSynonyms(raw_name, category);
        await prisma.labOfferedTest.update({
          where: { id },
          data: { synonyms },
        });
      })
    ).catch((e) => console.error("[sheets/confirm] Synonym generation failed:", e));
  }

  return NextResponse.json({
    success: true,
    applied: {
      added:   body.added.length,
      changed: body.changed.length,
      removed: body.removed.length,
    },
    synonyms_generating: newTestIds.length > 0,
  });
}
