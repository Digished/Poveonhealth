export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { renderResultsPdf } from "@/lib/result-render";

/**
 * GET /api/lab/results/preview?ids=a,b,c
 * Stream a combined branded PDF of several results (same request) inline, for
 * previewing before sending. Requires can_view_requests.
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30);
  if (ids.length === 0) return NextResponse.json({ error: "No result ids" }, { status: 400 });

  const rendered = await renderResultsPdf(ids, auth.lab_id);
  if (!rendered) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(rendered.buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="results-${rendered.code}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
