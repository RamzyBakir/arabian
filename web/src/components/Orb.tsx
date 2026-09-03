interface OrbProps {
  size?: number;
  float?: boolean;
  className?: string;
}

/**
 * Orb — the Arabian mascot. A glossy floating sphere with two pill-shaped
 * eyes. No body, no mouth, no pupils (README §7).
 */
export function Orb({ size = 48, float = false, className = "" }: OrbProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`${float ? "orb-float " : ""}${className}`}
      role="img"
      aria-label="Orb, the Arabian mascot"
    >
      <defs>
        <radialGradient id="orb-body" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#bfdbfe" />
          <stop offset="45%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#172554" />
        </radialGradient>
        <radialGradient id="orb-gloss" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#orb-body)" />
      <ellipse cx="36" cy="28" rx="17" ry="11" fill="url(#orb-gloss)" opacity="0.75" />
      <ellipse cx="63" cy="76" rx="20" ry="8" fill="#0b1120" opacity="0.18" />
      <g className="orb-eyes">
        <rect x="31" y="42" width="11" height="20" rx="5.5" fill="#0b1120" />
        <rect x="58" y="42" width="11" height="20" rx="5.5" fill="#0b1120" />
      </g>
    </svg>
  );
}
