import { Suspense } from "react";
import AgreementSigningPage from "@/components/AgreementSigningPage";

export const metadata = {
  title: "Sign Partnership Agreement — Poveon Health",
  description: "Review and digitally sign your Poveon Health Laboratory Partnership Agreement.",
};

export default function OnboardPage({ params }: { params: { token: string } }) {
  return (
    <Suspense>
      <AgreementSigningPage token={params.token} />
    </Suspense>
  );
}
