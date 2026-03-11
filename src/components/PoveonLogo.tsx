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

      {/* Flask body — outline only, no fill */}
      <path
        d="M13 7 L13 13 L7.5 23 Q6.5 27 9 28 L23 28 Q25.5 27 24.5 23 L19 13 L19 7"
        stroke="white"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Neck cap */}
      <line
        x1="11" y1="7" x2="21" y2="7"
        stroke="white" strokeWidth="1.8" strokeLinecap="round"
      />

      {/* Liquid level — sky-blue accent line inside the body */}
      <line
        x1="9" y1="21" x2="23" y2="21"
        stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round"
      />
    </svg>
  );
}
