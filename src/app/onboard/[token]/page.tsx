import { Suspense } from "react";
import AgreementSigningPage from "@/components/AgreementSigningPage";

export const metadata = {
  title: "Sign Partnership Agreement — Poveon",
  description: "Review and digitally sign your Poveon Laboratory Partnership Agreement.",
};

export default function OnboardPage({ params }: { params: { token: string } }) {
  return (
    <Suspense>
      <AgreementSigningPage token={params.token} />
    </Suspense>
  );
}
