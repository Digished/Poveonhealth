import { prisma } from "@/lib/prisma";
import { buildOru, OruObservation } from "@/lib/hl7/oru";
import { randomUUID } from "crypto";

type StoredValue = { name: string; value?: string; unit?: string; reference_range?: string; flag?: string };
type TemplateParam = { name: string; loinc?: string; test_code?: string };

const MIRTH_TIMEOUT_MS = 12_000;
const ACK_MAX = 4000; // cap stored ACK/error text

export interface HL7SendResult {
  skipped?: boolean;
  reason?: string;
  messageId?: string;
  status?: string;
}

/** POST a built HL7 message to the lab's Mirth endpoint and record the outcome. */
async function postToMirth(
  messageId: string,
  url: string,
  token: string | null,
  payload: string,
): Promise<{ status: "ack" | "error"; ackText: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MIRTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/hl7-v2+er7; charset=utf-8",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: payload,
      signal: controller.signal,
    });
    const body = (await res.text().catch(() => "")).slice(0, ACK_MAX);
    if (!res.ok) return { status: "error", ackText: `HTTP ${res.status}: ${body || res.statusText}` };
    return { status: "ack", ackText: body || `HTTP ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "Timed out contacting Mirth" : e.message) : "Network error";
    return { status: "error", ackText: msg.slice(0, ACK_MAX) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build and send an ORU^R01 for a reported result to the lab's Mirth channel.
 * No-ops (skipped) when the lab hasn't enabled Mirth. Safe to call
 * fire-and-forget — it records an HL7Message row regardless of outcome.
 */
export async function sendResultToMirth(resultId: string, labId: string): Promise<HL7SendResult> {
  const result = await prisma.requestResult.findUnique({
    where: { id: resultId },
    include: {
      lab: { select: { name: true, mirth_enabled: true, mirth_url: true, mirth_auth_token: true } },
      request: { select: { id: true, code: true, patient_name: true, patient_age: true, sex: true, patient_phone: true } },
    },
  });
  if (!result || result.lab_id !== labId) return { skipped: true, reason: "not-found" };
  if (!result.lab.mirth_enabled || !result.lab.mirth_url) return { skipped: true, reason: "mirth-disabled" };

  // Merge template coding (LOINC / local code) onto the stored observation values.
  let coding = new Map<string, TemplateParam>();
  let orderName: string | null = result.department;
  if (result.template_id) {
    const tpl = await prisma.labResultTemplate.findUnique({ where: { id: result.template_id }, select: { name: true, parameters: true } });
    if (tpl) {
      orderName = tpl.name;
      const params = (Array.isArray(tpl.parameters) ? tpl.parameters : []) as TemplateParam[];
      coding = new Map(params.map((p) => [p.name.trim().toLowerCase(), p]));
    }
  }

  const stored = (Array.isArray(result.values) ? result.values : []) as StoredValue[];
  const observations: OruObservation[] = stored.map((v) => {
    const c = coding.get((v.name ?? "").trim().toLowerCase());
    return {
      name: v.name,
      value: v.value,
      unit: v.unit,
      reference_range: v.reference_range,
      flag: v.flag,
      loinc: c?.loinc,
      test_code: c?.test_code,
    };
  });

  const controlId = randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase();
  const { message, messageType } = buildOru({
    labName: result.lab.name,
    request: result.request,
    result: {
      id: result.id,
      department: result.department,
      comment: result.comment,
      verified_by: result.verified_by,
      verified_at: result.verified_at,
      orderName,
      observations,
    },
    controlId,
  });

  const record = await prisma.hL7Message.create({
    data: {
      lab_id: labId,
      request_id: result.request.id,
      result_id: result.id,
      direction: "outbound",
      message_type: messageType,
      control_id: controlId,
      payload: message,
      status: "sent",
      attempts: 1,
    },
  });

  const { status, ackText } = await postToMirth(record.id, result.lab.mirth_url, result.lab.mirth_auth_token, message);
  await prisma.hL7Message.update({ where: { id: record.id }, data: { status, ack_text: ackText } });

  return { messageId: record.id, status };
}

/** Resend a previously built HL7 message (e.g. after fixing the Mirth endpoint). */
export async function resendHl7Message(messageId: string, labId: string): Promise<HL7SendResult> {
  const msg = await prisma.hL7Message.findUnique({ where: { id: messageId } });
  if (!msg || msg.lab_id !== labId) return { skipped: true, reason: "not-found" };
  const lab = await prisma.lab.findUnique({ where: { id: labId }, select: { mirth_enabled: true, mirth_url: true, mirth_auth_token: true } });
  if (!lab?.mirth_enabled || !lab.mirth_url) return { skipped: true, reason: "mirth-disabled" };

  await prisma.hL7Message.update({ where: { id: msg.id }, data: { status: "sent", attempts: { increment: 1 } } });
  const { status, ackText } = await postToMirth(msg.id, lab.mirth_url, lab.mirth_auth_token, msg.payload);
  await prisma.hL7Message.update({ where: { id: msg.id }, data: { status, ack_text: ackText } });
  return { messageId: msg.id, status };
}
