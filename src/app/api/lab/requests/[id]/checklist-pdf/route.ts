export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { renderVisitChecklistPdf } from "@/lib/checklist-render";

/**
 * GET /api/lab/requests/[id]/checklist-pdf
 * Stream the patient's visit checklist (departmental routing slip) inline for
 * printing. The client carries the printed copy around the lab's departments.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rendered = await renderVisitChecklistPdf(params.id, auth.lab_id);
  if (!rendered) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(rendered.buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="visit-checklist-${rendered.code}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
