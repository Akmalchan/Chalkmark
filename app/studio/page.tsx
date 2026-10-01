import type { Metadata } from "next";
import { Studio } from "@/components/studio/Studio";

export const metadata: Metadata = { title: "Capture · Chalkmark" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const source = params.source === "file" ? "file" : params.source === "youtube" ? "youtube" : "camera";
  // ?src=/path.mp4 loads a same-origin video (backup demo clips, local testing).
  const src = typeof params.src === "string" && params.src.startsWith("/") && !params.src.startsWith("//") ? params.src : undefined;
  const sample = params.sample === "1" ? "/demo/sample-lecture.mp4" : src;
  return <Studio initialSource={sample ? "file" : source} sampleSrc={sample} simulated={params.camera === "simulated"} dry={params.dry === "1"} />;
}
