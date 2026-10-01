import type { Metadata } from "next";
import { RedrawLab } from "@/components/RedrawLab";

export const metadata: Metadata = { title: "Redraw lab · Chalkmark" };

export default function RedrawLabPage() {
  return <RedrawLab />;
}
