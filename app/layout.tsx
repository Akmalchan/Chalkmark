import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chalkmark — Continuous visual memory for lectures",
  description: "Turn a lecture video into chronological notes that remember every meaningful board state.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
