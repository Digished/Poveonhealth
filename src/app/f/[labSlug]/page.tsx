import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { labUrl, shouldRedirectToLabHost } from "@/lib/lab-urls";
import { prisma } from "@/lib/prisma";
import { FeedbackClient } from "@/components/lab/FeedbackClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { labSlug: string } }) {
  const lab = await prisma.lab.findUnique({ where: { slug: params.labSlug }, select: { name: true } });
  return { title: lab ? `Feedback — ${lab.name}` : "Feedback" };
}

/**
 * Public feedback page — reached via the lab's shareable link or the feedback
 * QR code displayed at the lab. Visitors identify with name + email, then
 * rate their experience.
 */
export default async function LabFeedbackPage({ params }: { params: { labSlug: string } }) {
  // Legacy path link (poveon.com/{section}) — send it to the lab's own
  // subdomain so every lab URL settles on one canonical host.
  if (shouldRedirectToLabHost(params.labSlug, headers().get("host"))) {
    redirect(labUrl(params.labSlug, "/f"));
  }

  const lab = await prisma.lab.findUnique({
    where: { slug: params.labSlug },
    select: { id: true, name: true, logo_url: true },
  });
  if (!lab) notFound();

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-medical-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          {lab.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lab.logo_url} alt={lab.name} className="mx-auto h-14 w-14 rounded-2xl object-contain" />
          ) : (
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-medical-600 text-xl font-bold text-white">
              {lab.name.charAt(0)}
            </div>
          )}
          <h1 className="mt-3 text-xl font-bold text-slate-900">{lab.name}</h1>
          <p className="text-sm text-slate-500">How was your experience with us?</p>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <FeedbackClient labId={lab.id} labName={lab.name} />
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">Powered by Poveon Health</p>
      </div>
    </main>
  );
}
