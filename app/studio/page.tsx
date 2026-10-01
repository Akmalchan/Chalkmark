import type { Metadata } from "next";
import { Studio } from "@/components/studio/Studio";

export const metadata: Metadata = { title: "Capture · Chalkmark" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const source = params.source === "file" ? "file" : "camera";
  const sample = params.sample === "1" ? "/demo/sample-lecture.mp4" : undefined;
  return <Studio initialSource={sample ? "file" : source} sampleSrc={sample} simulated={params.camera === "simulated"} />;
}
