"use client";

import { useState } from "react";
import { HeroSection } from "@/components/HeroSection";
import { RequestFormToggle } from "@/components/RequestFormToggle";
import type { Lab } from "@/lib/types";

type Mode = "professional" | "patient";

export function HomePageContent({ initialLabs }: { initialLabs: Lab[] }) {
  const [mode, setMode] = useState<Mode>("professional");

  return (
    <>
      <div className="w-full snap-start snap-always">
        <HeroSection mode={mode} />
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-2 snap-start snap-always">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <RequestFormToggle initialLabs={initialLabs as any} onModeChange={setMode} />
      </div>
    </>
  );
}
