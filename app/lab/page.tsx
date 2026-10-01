import type { Metadata } from "next";
import { Lab } from "@/components/Lab";

export const metadata: Metadata = { title: "Lab · Chalkmark" };

export default function LabPage() {
  return <Lab />;
}
