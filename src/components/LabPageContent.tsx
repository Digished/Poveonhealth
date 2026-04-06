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
  logoUrl?: string | null;
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
  logoUrl,
  locations,
}: LabPageContentProps) {
  const [mode, setMode] = useState<Mode>("professional");

  return (
    <>
      <div className="w-full snap-start snap-always">
        <LabHeroSection labName={labName} logoUrl={logoUrl} mode={mode} />
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-2 snap-start snap-always">
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
