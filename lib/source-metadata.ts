export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1) :
      ["www.youtube.com", "youtube.com"].includes(url.hostname) && url.pathname === "/watch" ? url.searchParams.get("v") : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

// Read only the requested video's own details, never recommendations' durations.
export function parseYouTubeDuration(html: string, id: string): number | null {
  const match = html.match(/"videoDetails"\s*:\s*\{\s*"videoId"\s*:\s*"([\w-]+)"\s*,\s*"title"\s*:\s*"(?:\\.|[^"\\])*"\s*,\s*"lengthSeconds"\s*:\s*"(\d+)"/);
  if (!match || match[1] !== id) return null;
  const duration = Number(match[2]);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export async function youtubeDuration(id: string): Promise<number | null> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(12_000), cache: "no-store", redirect: "error",
    });
    return response.ok ? parseYouTubeDuration(await response.text(), id) : null;
  } catch { return null; }
}
