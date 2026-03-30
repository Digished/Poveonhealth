export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { prisma } from "@/lib/prisma";
import { AGREEMENT_VERSION } from "@/lib/agreement/content";
import { AgreementPdf } from "@/lib/agreement/generate-pdf";

/** GET /api/onboard/preview-pdf?token=xxx
 *  Generates a draft PDF (cover + terms only, no signature cert) for review. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const invite = await prisma.labAgreementInvite.findUnique({
    where: { token },
    include: { lab: { select: { id: true, name: true, address: true } } },
  });

  if (!invite) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (invite.expires_at < new Date()) return NextResponse.json({ error: "Link expired" }, { status: 410 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { renderToBuffer } = await import("@react-pdf/renderer") as any;

  const pdfBuffer = await renderToBuffer(
    React.createElement(AgreementPdf, {
      labName: invite.lab.name,
      labAddress: invite.lab.address || "",
      signerName: "— Pending Signature —",
      signerEmail: "",
      signedAt: "— Not yet signed —",
      referenceNumber: `PREVIEW-${AGREEMENT_VERSION}`,
      pdfHash: "DRAFT — FOR REVIEW ONLY",
      customContent: invite.custom_content || undefined,
      previewOnly: true,
    })
  );

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="poveon-agreement-preview.pdf"`,
    },
  });
}
