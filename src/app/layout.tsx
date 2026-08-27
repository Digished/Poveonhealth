import type { Metadata } from "next";
import { Suspense } from "react";
import { Toaster } from "react-hot-toast";
import { RefTracker } from "@/components/RefTracker";
import { RouteTransition } from "@/components/site/RouteTransition";
import "./globals.css";

// Font variable object for CSS
const inter = { variable: "--font-inter" };

const logoUrl = process.env.NEXT_PUBLIC_SITE_LOGO_URL ?? "/logo.svg";
const isSvg = logoUrl.endsWith(".svg");

export const metadata: Metadata = {
  title: "Poveon — Lab Request Platform",
  description:
    "A secure platform for doctors to send laboratory test requests to labs without requiring login.",
  keywords: ["laboratory", "lab request", "medical", "health", "doctor"],
  icons: {
    icon: [{ url: logoUrl, type: isSvg ? "image/svg+xml" : "image/png" }],
  },
  openGraph: {
    title: "Poveon",
    description: "Seamless lab test requests for healthcare professionals",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`scroll-smooth ${inter.variable}`}>
      <body className="font-sans antialiased">
        <Suspense fallback={null}>
          <RefTracker />
        </Suspense>
        <RouteTransition>{children}</RouteTransition>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "#1e293b",
              color: "#f1f5f9",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.1)",
              fontSize: "14px",
              padding: "12px 16px",
            },
            success: {
              iconTheme: {
                primary: "#10b981",
                secondary: "#f1f5f9",
              },
            },
            error: {
              iconTheme: {
                primary: "#ef4444",
                secondary: "#f1f5f9",
              },
            },
          }}
        />
      </body>
    </html>
  );
}
