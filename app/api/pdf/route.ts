import { NextResponse } from "next/server";
import { renderPdf, type PaperSize } from "@/lib/server/pdf";
import { slugify } from "@/lib/notes/export";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST { view: "sheet" | "full", paper: "Letter" | "A4", doc, urls } → application/pdf.
 * `urls` maps figure/board file names to data: URLs (or public URLs), so the print page can show
 * the lecturer's own ink without access to the browser's blob: URLs.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { view?: string; paper?: string; doc?: { title?: string; sections?: unknown[] }; urls?: Record<string, string> };
    if (!body.doc || !Array.isArray(body.doc.sections)) return NextResponse.json({ error: "Missing notes." }, { status: 400 });
    const paper: PaperSize = body.paper === "A4" ? "A4" : "Letter";
    const view = body.view === "full" ? "full" : "sheet";
    // The print page is served by this same server; inside Cloud Run that is localhost.
    const origin = process.env.NODE_ENV === "production" ? `http://127.0.0.1:${process.env.PORT || 8080}` : new URL(request.url).origin;
    const title = String(body.doc.title || "Lecture notes");
    const pdf = await renderPdf(origin, { view, paper, doc: body.doc, urls: body.urls ?? {} }, paper, title, view === "sheet");
    const name = `${slugify(title) || "chalkmark"}${view === "sheet" ? "-study-sheet" : "-notes"}-${paper.toLowerCase()}.pdf`;
    return new NextResponse(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"`, "cache-control": "no-store" } });
  } catch (error) {
    console.error("[chalkmark] pdf failed", error);
    return NextResponse.json({ error: error instanceof Error ? `The PDF could not be made: ${error.message}` : "The PDF could not be made." }, { status: 500 });
  }
}
