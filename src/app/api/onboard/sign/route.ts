export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { renderToBuffer } = require("@react-pdf/renderer");
import React from "react";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { AGREEMENT_VERSION } from "@/lib/agreement/content";
import { AgreementPdf } from "@/lib/agreement/generate-pdf";
import { agreementInviteEmail, agreementSignedConfirmationEmail } from "@/lib/email/templates";

const AGREEMENTS_BUCKET = "agreements";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, signer_name, signer_title, signer_email, signature_data_url } = body;

    if (!token || !signer_name || !signer_email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate invite token
    const invite = await prisma.labAgreementInvite.findUnique({
      where: { token },
      include: { lab: { select: { id: true, name: true, address: true, email: true } } },
    });

    if (!invite || invite.used || invite.expires_at < new Date()) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 410 });
    }

    // Capture audit metadata
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;

    const signedAt = new Date();
    const signedAtStr = signedAt.toUTCString();
    const refNo = `AGR-${invite.lab.name.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8)}-${signedAt.getFullYear()}-${String(signedAt.getMonth() + 1).padStart(2, "0")}`;

    // Generate the PDF (without hash first, then compute hash of this buffer)
    const pdfBuffer = await renderToBuffer(
      React.createElement(AgreementPdf, {
        labName: invite.lab.name,
        labAddress: invite.lab.address || "",
        signerName: signer_name,
        signerEmail: signer_email,
        signerTitle: signer_title || undefined,
        signedAt: signedAtStr,
        ipAddress: ip,
        userAgent: userAgent,
        signatureDataUrl: signature_data_url || undefined,
        referenceNumber: refNo,
        pdfHash: "— hash computed after initial generation —",
      })
    );

    // Compute SHA-256 hash of the PDF bytes
    const pdfHash = createHash("sha256").update(pdfBuffer).digest("hex");

    // Re-generate PDF with the actual hash embedded on the certificate page
    const finalPdfBuffer = await renderToBuffer(
      React.createElement(AgreementPdf, {
        labName: invite.lab.name,
        labAddress: invite.lab.address || "",
        signerName: signer_name,
        signerEmail: signer_email,
        signerTitle: signer_title || undefined,
        signedAt: signedAtStr,
        ipAddress: ip,
        userAgent: userAgent,
        signatureDataUrl: signature_data_url || undefined,
        referenceNumber: refNo,
        pdfHash,
      })
    );

    // Recompute hash of the final PDF (the hash of the final PDF won't exactly match
    // the placeholder render, but it will be stable for future integrity checks)
    const finalHash = createHash("sha256").update(finalPdfBuffer).digest("hex");

    // Upload to Supabase Storage (private bucket)
    const supabase = await createAdminClient();
    const fileName = `${invite.lab.id}/${refNo}-${Date.now()}.pdf`;

    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find((b) => b.name === AGREEMENTS_BUCKET)) {
      await supabase.storage.createBucket(AGREEMENTS_BUCKET, { public: false });
    }

    const { error: uploadError } = await supabase.storage
      .from(AGREEMENTS_BUCKET)
      .upload(fileName, finalPdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    // Write DB records in a transaction
    const agreement = await prisma.$transaction(async (tx) => {
      const agr = await tx.labAgreement.create({
        data: {
          lab_id: invite.lab.id,
          invite_id: invite.id,
          version: AGREEMENT_VERSION,
          signed_at: signedAt,
          signer_name,
          signer_email,
          signer_title: signer_title || null,
          ip_address: ip || null,
          user_agent: userAgent || null,
          pdf_url: fileName,
          pdf_hash: finalHash,
        },
      });
      await tx.labAgreementInvite.update({
        where: { id: invite.id },
        data: { used: true },
      });
      return agr;
    });

    // Generate a short-lived signed URL for the confirmation email download link
    const { data: signedUrl } = await supabase.storage
      .from(AGREEMENTS_BUCKET)
      .createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7 days

    // Send confirmation to signer
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: signer_email,
      subject: `Your Poveon Partnership Agreement — ${invite.lab.name}`,
      html: agreementSignedConfirmationEmail({
        signerName: signer_name,
        labName: invite.lab.name,
        refNo,
        signedAt: signedAtStr,
        downloadUrl: signedUrl?.signedUrl ?? "",
      }),
    });

    // Notify admin
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    if (adminEmail) {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: adminEmail,
        subject: `Agreement signed — ${invite.lab.name}`,
        html: `<p><strong>${signer_name}</strong> (${signer_email}) from <strong>${invite.lab.name}</strong> signed the partnership agreement at ${signedAtStr}.<br/>Reference: ${refNo}<br/>IP: ${ip ?? "unknown"}</p>`,
      });
    }

    return NextResponse.json({ success: true, agreement_id: agreement.id, ref_no: refNo });
  } catch (err) {
    console.error("[onboard/sign]", err);
    return NextResponse.json({ error: "Signing failed. Please try again." }, { status: 500 });
  }
}
