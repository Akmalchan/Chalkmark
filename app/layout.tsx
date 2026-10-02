import type { Metadata } from "next";
import { Fredoka } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./paper.css";
import "./studio.css";
import "./landing.css";

// Chunky rounded display face for the brand wordmark; downloaded at build time and self-hosted.
const brand = Fredoka({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-brand" });

export const metadata: Metadata = {
  title: "Chalkmark — the board forgets, your notes don't",
  description: "Point a camera at the board: Chalkmark removes the lecturer, saves every board before it is erased, and turns it into clean, typeset study notes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={brand.variable}>
      <body>{children}</body>
    </html>
  );
}
