import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Theme classes are built as literal strings in src/lib/encounter-themes.ts —
  // safelist the dynamic gradient families so they survive purge regardless.
  safelist: [
    { pattern: /^(from|via|to)-(sky|indigo|emerald|teal|cyan|rose|pink|fuchsia|violet|purple|amber|orange|slate|gray|zinc)-(50|400|500|600|700|800)$/ },
    "bg-gradient-to-br",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        // Backed by CSS variables so a theme wrapper (.theme-*) can recolour every
        // medical-* utility at once. Defaults live in globals.css :root.
        medical: {
          50: "rgb(var(--medical-50) / <alpha-value>)",
          100: "rgb(var(--medical-100) / <alpha-value>)",
          200: "rgb(var(--medical-200) / <alpha-value>)",
          300: "rgb(var(--medical-300) / <alpha-value>)",
          400: "rgb(var(--medical-400) / <alpha-value>)",
          500: "rgb(var(--medical-500) / <alpha-value>)",
          600: "rgb(var(--medical-600) / <alpha-value>)",
          700: "rgb(var(--medical-700) / <alpha-value>)",
          800: "rgb(var(--medical-800) / <alpha-value>)",
          900: "rgb(var(--medical-900) / <alpha-value>)",
          950: "rgb(var(--medical-950) / <alpha-value>)",
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.4s ease-out",
        "sheet-up": "sheetUp 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in-up": "fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scaleIn 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "backdrop-in": "backdropIn 0.2s ease-out both",
        "float": "floatBob 4s ease-in-out infinite",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "cloud-drift": "cloudDrift 60s linear infinite",
        "twinkle": "twinkle 2.5s ease-in-out infinite alternate",
        // Soft attention ring for the next pending action button.
        "pending-pulse": "pendingPulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.90)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        backdropIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        sheetUp: {
          "0%": { opacity: "0", transform: "translateY(100%)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        floatBob: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        cloudDrift: {
          "0%":   { transform: "translateX(-260px)" },
          "100%": { transform: "translateX(calc(100vw + 260px))" },
        },
        twinkle: {
          "0%":   { opacity: "0.15" },
          "100%": { opacity: "0.95" },
        },
        pendingPulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgb(var(--medical-500) / 0.5)" },
          "50%": { boxShadow: "0 0 0 6px rgb(var(--medical-500) / 0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
