import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        medical: {
          50: "#f0f7ff",
          100: "#e0effe",
          200: "#bae0fd",
          300: "#7dc8fb",
          400: "#38aaf5",
          500: "#0e8fe5",
          600: "#0270c3",
          700: "#0259a0",
          800: "#064b84",
          900: "#0a3f6e",
          950: "#072849",
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.4s ease-out",
        "fade-in-up": "fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scaleIn 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "backdrop-in": "backdropIn 0.2s ease-out both",
        "float": "floatBob 4s ease-in-out infinite",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "cloud-drift": "cloudDrift 60s linear infinite",
        "twinkle": "twinkle 2.5s ease-in-out infinite alternate",
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
      },
    },
  },
  plugins: [],
};
export default config;
