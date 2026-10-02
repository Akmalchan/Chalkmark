import type { Metadata } from "next";
import { PrintDocument } from "@/components/PrintDocument";

export const metadata: Metadata = { title: "Chalkmark · print", robots: { index: false } };

/** Print-only view used by the PDF renderer (/api/pdf). */
export default function PrintPage() {
  return <PrintDocument />;
}
