import Link from "next/link";

const GREEN = "#1b4430";
const LIME = "#9fd84a";
const ORANGE = "#ff6b35";
const SKY = "#3ea2f2";

function starPath(cx: number, cy: number, outer: number, inner: number) {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 ? inner : outer;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

/** The Chalkmark mascot: a happy stick of chalk riding a lime swoosh up to a checked star. */
export function Mascot({ size = 48, title = "Chalkmark" }: { size?: number; title?: string }) {
  return (
    // Inline size + no inherited stroke: the legacy global `svg` rule (20px icons) must not apply here.
    <svg viewBox="0 0 128 100" width={size * 1.28} height={size} style={{ width: size * 1.28, height: size, stroke: "none", fill: "none" }} role="img" aria-label={title || undefined} aria-hidden={title ? undefined : true} className="mascot">
      {/* swoosh */}
      <path d="M10 88 C 40 99, 76 88, 94 44" fill="none" stroke={LIME} strokeWidth="7" strokeLinecap="round" />
      <path d="M86 44 L97 36 L99 50 Z" fill={LIME} stroke={LIME} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="7" cy="80" r="2.4" fill={LIME} /><circle cx="15" cy="96" r="1.8" fill={LIME} />
      {/* star with a check */}
      <path d={starPath(106, 24, 15, 7.2)} fill={ORANGE} stroke="#ff8a4c" strokeWidth="2" strokeLinejoin="round" />
      <path d="M100 24.5 L104.5 29 L112.5 19.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <g stroke={ORANGE} strokeWidth="2.6" strokeLinecap="round">
        <path d="M89 12 L92 15" /><path d="M118 5 L115 9" /><path d="M123 27 L119 27" />
      </g>
      {/* sparkle */}
      <g stroke={SKY} strokeWidth="3" strokeLinecap="round"><path d="M14 30 L19 37" /><path d="M8 43 L16 45" /></g>
      {/* chalk body, tilted */}
      <g transform="rotate(16 48 56)">
        <rect x="31" y="20" width="34" height="68" rx="13" fill="#f6f2e6" stroke={GREEN} strokeWidth="4" />
        <ellipse cx="48" cy="25" rx="13" ry="4.6" fill="#fdfbf4" stroke={GREEN} strokeWidth="2" />
        <path d="M37 80 Q48 86 59 80" fill="none" stroke="#e1dccb" strokeWidth="3" strokeLinecap="round" />
        {/* face */}
        <g stroke={GREEN} strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M38.5 47 Q41.5 43 44.5 47" /><path d="M51.5 47 Q54.5 43 57.5 47" />
        </g>
        <path d="M42.5 53 Q48 62 53.5 53 Z" fill={GREEN} />
        <ellipse cx="48" cy="57.3" rx="2.8" ry="1.7" fill="#ff7a52" />
        <circle cx="37" cy="53" r="2.7" fill="#ff9c86" opacity=".85" /><circle cx="59" cy="53" r="2.7" fill="#ff9c86" opacity=".85" />
        {/* arms: one waving */}
        <g fill="none" stroke={GREEN} strokeWidth="3.6" strokeLinecap="round">
          <path d="M31.5 56 Q24 58 25 66" />
          <path d="M64.5 50 Q72 49 73 40" />
        </g>
      </g>
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return <span className="brand-wordmark" style={{ fontSize: size }}>CHALKMARK</span>;
}

/** Mascot + wordmark lockup; links home unless `href` is null. */
export function Logo({ size = "md", href = "/" }: { size?: "sm" | "md" | "lg"; href?: string | null }) {
  const dims = { sm: [30, 17], md: [40, 22], lg: [84, 46] }[size];
  const inner = <><Mascot size={dims[0]} /><Wordmark size={dims[1]} /></>;
  return href === null
    ? <span className={`brand-logo brand-${size}`}>{inner}</span>
    : <Link className={`brand-logo brand-${size}`} href={href} aria-label="Chalkmark home">{inner}</Link>;
}
