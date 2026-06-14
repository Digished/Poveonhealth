// =============================================================================
// POVEON HEALTH - ENCOUNTER PAGE THEMES
// Doctors pick a colour theme for their public encounter page (/d/[slug]).
// Class strings are static so Tailwind keeps them in the build.
// =============================================================================

export interface EncounterTheme {
  id: string;
  label: string;
  /** Full-page background gradient */
  pageBg: string;
  /** Hero avatar/icon gradient */
  heroGradient: string;
  /** Small swatch shown in the picker */
  swatch: string;
}

export const ENCOUNTER_THEMES: EncounterTheme[] = [
  {
    id: "ocean",
    label: "Ocean",
    pageBg: "bg-gradient-to-br from-sky-50 via-indigo-50 to-emerald-50",
    heroGradient: "from-medical-500 to-medical-700",
    swatch: "bg-gradient-to-br from-sky-400 to-indigo-500",
  },
  {
    id: "emerald",
    label: "Emerald",
    pageBg: "bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50",
    heroGradient: "from-emerald-500 to-teal-700",
    swatch: "bg-gradient-to-br from-emerald-400 to-teal-500",
  },
  {
    id: "rose",
    label: "Rose",
    pageBg: "bg-gradient-to-br from-rose-50 via-pink-50 to-fuchsia-50",
    heroGradient: "from-rose-500 to-pink-700",
    swatch: "bg-gradient-to-br from-rose-400 to-pink-500",
  },
  {
    id: "violet",
    label: "Violet",
    pageBg: "bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50",
    heroGradient: "from-violet-500 to-purple-700",
    swatch: "bg-gradient-to-br from-violet-400 to-purple-500",
  },
  {
    id: "amber",
    label: "Sunset",
    pageBg: "bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50",
    heroGradient: "from-amber-500 to-orange-600",
    swatch: "bg-gradient-to-br from-amber-400 to-orange-500",
  },
  {
    id: "slate",
    label: "Slate",
    pageBg: "bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-100",
    heroGradient: "from-slate-600 to-slate-800",
    swatch: "bg-gradient-to-br from-slate-400 to-slate-600",
  },
];

export const DEFAULT_THEME_ID = "ocean";

export function getEncounterTheme(id: string | null | undefined): EncounterTheme {
  return ENCOUNTER_THEMES.find((t) => t.id === id) ?? ENCOUNTER_THEMES[0];
}
