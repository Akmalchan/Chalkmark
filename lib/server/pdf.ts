import type { Browser } from "puppeteer-core";

/**
 * Real PDFs from the same HTML the app shows: headless Chrome opens the print-only page with the
 * notes injected, waits for math, fonts and figures, and prints exact US Letter (or A4) pages.
 * Text stays text, KaTeX stays typeset and redrawn figures stay vector.
 */

export type PaperSize = "Letter" | "A4";

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return "/usr/bin/chromium";
}

let browser: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browser) {
    const puppeteer = await import("puppeteer-core");
    browser = puppeteer.launch({
      executablePath: chromePath(),
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--disable-gpu"],
    });
    browser.then(b => b.on("disconnected", () => { browser = null; })).catch(() => { browser = null; });
  }
  return browser;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** `paged`: the document lays out its own pages (study sheet): no margins, no footer, page size from CSS. */
export async function renderPdf(origin: string, payload: unknown, paper: PaperSize, title: string, paged = false): Promise<Uint8Array> {
  const page = await (await getBrowser()).newPage();
  try {
    await page.evaluateOnNewDocument((data: unknown) => { (window as unknown as { __CHALKMARK_PRINT__: unknown }).__CHALKMARK_PRINT__ = data; }, payload);
    await page.goto(`${origin}/print`, { waitUntil: "networkidle0", timeout: 45_000 });
    await page.waitForFunction("window.__printReady === true", { timeout: 20_000 });
    await page.evaluate("document.fonts.ready");
    if (paged) return await page.pdf({ format: paper, printBackground: true, preferCSSPageSize: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    return await page.pdf({
      format: paper,
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "12mm", bottom: "15mm", left: "13mm", right: "13mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;padding:0 13mm;display:flex;justify-content:space-between;font-family:Helvetica,Arial,sans-serif;font-size:7.5px;color:#8a958e;"><span>Chalkmark · ${escapeHtml(title).slice(0, 90)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
  } finally {
    await page.close().catch(() => {});
  }
}
