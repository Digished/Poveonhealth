import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poveon — Lab Request Platform",
  description:
    "A secure platform for doctors to send laboratory test requests to labs without requiring login.",
  keywords: ["laboratory", "lab request", "medical", "health", "doctor"],
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
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
    <html lang="en" className="scroll-smooth">
      <body className="font-sans antialiased">
        {children}
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
