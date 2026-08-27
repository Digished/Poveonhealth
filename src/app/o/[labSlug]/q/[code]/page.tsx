import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { labUrl, shouldRedirectToLabHost } from "@/lib/lab-urls";
import { prisma } from "@/lib/prisma";
import { QueueStatusClient } from "@/components/lab/QueueStatusClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { labSlug: string } }) {
  const lab = await prisma.lab.findUnique({ where: { slug: params.labSlug }, select: { name: true } });
  return { title: lab ? `Your queue position — ${lab.name}` : "Your queue position" };
}

/**
 * Personalised live queue-status page a client lands on after self-service
 * registration (also linked from their confirmation email). Shows the lab's
 * details, a thank-you, and their live position — updating in real time as
 * the people ahead are attended to.
 */
export default async function QueueStatusPage({ params }: { params: { labSlug: string; code: string } }) {
  // Legacy path link — settle on the lab's own subdomain.
  if (shouldRedirectToLabHost(params.labSlug, headers().get("host"))) {
    redirect(labUrl(params.labSlug, `/o/q/${encodeURIComponent(params.code)}`));
  }

  const lab = await prisma.lab.findUnique({
    where: { slug: params.labSlug },
    select: { id: true, name: true },
  });
  if (!lab) notFound();

  const code = decodeURIComponent(params.code).trim().toUpperCase();
  const request = await prisma.request.findUnique({ where: { code }, select: { id: true, lab_id: true, queue_confirmed_at: true } });
  if (!request || request.lab_id !== lab.id || !request.queue_confirmed_at) notFound();

  return <QueueStatusClient code={code} />;
}
