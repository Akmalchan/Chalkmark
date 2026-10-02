import type { Metadata } from "next";
import { Studio } from "@/components/studio/Studio";

export const metadata: Metadata = { title: "Capture · Chalkmark" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Recorded video is the default; ?source=camera / ?source=youtube pick the other inputs.
  const source = params.source === "camera" || params.camera === "simulated" ? "camera" : params.source === "youtube" ? "youtube" : "file";
  // ?src=/path.mp4 loads a same-origin video (backup demo clips, local testing).
  const src = typeof params.src === "string" && params.src.startsWith("/") && !params.src.startsWith("//") ? params.src : undefined;
  const sample = params.sample === "1" ? "/demo/sample-lecture.mp4" : src;
  return <Studio initialSource={sample ? "file" : source} sampleSrc={sample} simulated={params.camera === "simulated"} dry={params.dry === "1"} />;
}
