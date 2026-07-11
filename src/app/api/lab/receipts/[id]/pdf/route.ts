export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { renderReceiptPdf } from "@/lib/receipt-render";

/** GET /api/lab/receipts/[id]/pdf — stream the receipt inline for printing. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rendered = await renderReceiptPdf(params.id, auth.lab_id);
  if (!rendered) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(rendered.buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${String(rendered.receiptNo).padStart(5, "0")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
