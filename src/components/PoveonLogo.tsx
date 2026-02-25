export function PoveonLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={className}
    >
      {/* Dark background */}
      <rect width="32" height="32" rx="8" fill="#0f172a" />

      {/* P — vertical stem */}
      <rect x="11" y="7" width="4" height="19" rx="1.5" fill="white" />

      {/* P — bowl: perfect right semicircle, center (15,13), r=6 */}
      {/* M15 7 → arc clockwise to (15,19), chord=12=diameter → exact semicircle */}
      <path d="M15 7 A6 6 0 0 1 15 19 Z" fill="white" />

      {/* Sky-blue accent bar — underline beneath the stem */}
      <rect x="11" y="28" width="10" height="2" rx="1" fill="#0ea5e9" />
    </svg>
  );
}
