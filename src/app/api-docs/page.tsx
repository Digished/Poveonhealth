import type { Metadata } from "next";
import ApiDocsClient from "./ApiDocsClient";

export const metadata: Metadata = {
  title: "API Documentation — Poveon LIMS Integration",
  description:
    "Complete API reference for integrating LIMS and healthcare systems with the Poveon lab request platform.",
};

export default function ApiDocsPage() {
  return <ApiDocsClient />;
}
