import type { ReactNode } from "react";

/**
 * "Built at" strip: the event, its hosts and the Google stack, drifting by in a slow marquee.
 * Marks are simple typographic lockups, not the organizations' official logo files.
 */
const PARTNERS: Array<{ name: string; sub: string; mark: ReactNode }> = [
  {
    name: "SF Hacks", sub: "2026",
    mark: <span className="pm-mark pm-sfhacks">SF</span>,
  },
  {
    name: "San Francisco State", sub: "University",
    mark: <span className="pm-mark pm-sfsu" />,
  },
  {
    name: "Google Developer Groups", sub: "GDG",
    mark: (
      <svg viewBox="0 0 40 24" className="pm-svg" aria-hidden="true">
        <path d="M12 4 L3 12 L12 20" stroke="#ea4335" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M17 20 L23 4" stroke="#fbbc04" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M28 4 L37 12 L28 20" stroke="#4285f4" strokeWidth="4" strokeLinecap="round" fill="none" />
      </svg>
    ),
  },
  {
    name: "Major League Hacking", sub: "MLH",
    mark: <span className="pm-mark pm-mlh"><i /><i /><i /></span>,
  },
  {
    name: "Google Cloud", sub: "Cloud Run · Vertex AI",
    mark: (
      <svg viewBox="0 0 32 24" className="pm-svg" aria-hidden="true">
        <path d="M9 19 h15 a5.5 5.5 0 0 0 0-11 a7.5 7.5 0 0 0-14 1.5 A4.8 4.8 0 0 0 9 19 z" fill="none" stroke="#4285f4" strokeWidth="2.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "Gemini", sub: "3.1 Pro · 3.8 Flash",
    mark: (
      <svg viewBox="0 0 24 24" className="pm-svg" aria-hidden="true">
        <path d="M12 1 C 12.8 7.5, 16.5 11.2, 23 12 C 16.5 12.8, 12.8 16.5, 12 23 C 11.2 16.5, 7.5 12.8, 1 12 C 7.5 11.2, 11.2 7.5, 12 1 Z" fill="url(#pm-gemini)" />
        <defs><linearGradient id="pm-gemini" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4285f4" /><stop offset="1" stopColor="#9b72cb" /></linearGradient></defs>
      </svg>
    ),
  },
  {
    name: "Gemma 4", sub: "open weights",
    mark: <span className="pm-mark pm-gemma">G4</span>,
  },
];

export function Partners() {
  const item = (partner: (typeof PARTNERS)[number], key: string, hidden = false) => (
    <li key={key} className="partner" aria-hidden={hidden || undefined}>
      {partner.mark}
      <span className="partner-text"><b>{partner.name}</b><small>{partner.sub}</small></span>
    </li>
  );
  return (
    <section className="partners" aria-label="Built at SF Hacks 2026">
      <p className="partners-label">Built at <b>SF Hacks 2026</b>, hosted by SF State with GDG &amp; MLH, powered by Google Cloud</p>
      <div className="partners-marquee">
        <ul className="partners-track">
          {PARTNERS.map((partner, i) => item(partner, `a${i}`))}
          {PARTNERS.map((partner, i) => item(partner, `b${i}`, true))}
        </ul>
      </div>
    </section>
  );
}
