"use client";

import { useState } from "react";
import { LabHeroSection } from "@/components/LabHeroSection";
import { RequestFormToggle } from "@/components/RequestFormToggle";
import type { PhoneEntry } from "@/lib/phones";

type Mode = "professional" | "patient";

interface LabPageContentProps {
  labId: string;
  labName: string;
  labAddress?: string | null;
  labServiceCategories: string[];
  labPhones: unknown;
  labWhatsapp?: string | null;
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  locations: Array<{
    lab_id: string;
    lab_branch_id: string | null;
    name: string;
    address: string;
    phones: PhoneEntry[];
    whatsapp?: string | null;
    logo_url?: string | null;
    is_main: boolean;
    is_parent: boolean;
  }>;
}

export function LabPageContent({
  labId,
  labName,
  labAddress,
  labServiceCategories,
  labPhones,
  labWhatsapp,
  logoUrl,
  heroImageUrl,
  locations,
}: LabPageContentProps) {
  const [mode, setMode] = useState<Mode>("professional");

  return (
    <>
      {/* Hero — sticky, collapses into a compact bar on scroll */}
      <LabHeroSection
        labName={labName}
        logoUrl={logoUrl}
        heroImageUrl={heroImageUrl}
        labAddress={labAddress}
        labServiceCategories={labServiceCategories}
        labPhones={labPhones}
        labWhatsapp={labWhatsapp}
        mode={mode}
      />

      <div id="form-toggle" className="max-w-2xl mx-auto px-4 pb-2">
        <RequestFormToggle
          preselectedLabId={labId}
          preselectedLabName={labName}
          preselectedLabAddress={labAddress ?? undefined}
          preselectedServiceCategories={labServiceCategories}
          preselectedLabPhones={labPhones}
          locations={locations}
          onModeChange={setMode}
        />
      </div>
    </>
  );
}
