import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { ReceiptPdf, ReceiptItem } from "@/lib/receipt-pdf";

/** First phone from the lab's `phones` JSON array, if any. */
function firstPhone(phones: unknown): string | null {
  if (Array.isArray(phones) && phones.length > 0) return String(phones[0]);
  return null;
}

/** Render a stored RequestReceipt into a branded PDF buffer. Returns null if not found / wrong lab. */
export async function renderReceiptPdf(receiptId: string, labId: string): Promise<{ buffer: Buffer; receiptNo: number } | null> {
  const receipt = await prisma.requestReceipt.findUnique({
    where: { id: receiptId },
    include: {
      lab: { select: { name: true, address: true, phones: true } },
      request: { select: { code: true, patient_name: true, patient_phone: true } },
    },
  });
  if (!receipt || receipt.lab_id !== labId) return null;

  const items = (Array.isArray(receipt.items) ? receipt.items : []) as ReceiptItem[];
  const buffer = await renderToBuffer(
    ReceiptPdf({
      labName: receipt.lab.name,
      labAddress: receipt.lab.address || null,
      labPhone: firstPhone(receipt.lab.phones),
      receiptNo: receipt.receipt_no,
      kind: receipt.kind,
      issuedAt: receipt.created_at,
      code: receipt.request.code,
      currency: receipt.currency,
      amount: Number(receipt.amount),
      items,
      paymentMode: receipt.payment_mode,
      note: receipt.note,
      issuedBy: receipt.issued_by,
      patientName: receipt.request.patient_name,
      patientPhone: receipt.request.patient_phone,
    })
  );
  return { buffer: buffer as Buffer, receiptNo: receipt.receipt_no };
}
