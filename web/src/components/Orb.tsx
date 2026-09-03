export type OrbMood =
  | "normal" // ●ᴗ●
  | "thinking" // ●◡●
  | "question" // ●?●
  | "decision" // ●!●
  | "agent" // ●◉●
  | "warning" // ●△●
  | "success"; // ●⌣●

export const ORB_MOODS: OrbMood[] = [
  "normal",
  "thinking",
  "question",
  "decision",
  "agent",
  "warning",
  "success",
];

interface OrbProps {
  size?: number;
  float?: boolean;
  mood?: OrbMood;
  className?: string;
}

const EYE = { fill: "#0b1120" };

/**
 * Orb — the Arabian mascot. A glossy floating sphere with two pill-shaped
 * eyes and a small vocabulary of moods: ●ᴗ● normal, ●◡● thinking, ●?●
 * question, ●!● decision, ●◉● agent, ●△● warning, ●⌣● success.
 */
export function Orb({ size = 48, float = false, mood = "normal", className = "" }: OrbProps) {
  // Blinking animates transform on .orb-eyes, so eye offsets must be baked
  // into coordinates, not transforms.
  const eyeShift = mood === "thinking" ? { dx: -3, dy: -2 } : { dx: 0, dy: 0 };
  const pill = (x: number) => (
    <rect x={x + eyeShift.dx} y={42 + eyeShift.dy} width="11" height="20" rx="5.5" {...EYE} />
  );

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`${float ? "orb-float " : ""}${className}`}
      role="img"
      aria-label={`Orb, the Arabian mascot — ${mood}`}
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

      <g className="orb-eyes">
        {mood === "agent" ? (
          <>
            {/* ●◉● ringed eyes */}
            <circle cx="36.5" cy="52" r="7" fill="none" stroke={EYE.fill} strokeWidth="4.5" />
            <circle cx="36.5" cy="52" r="2" {...EYE} />
            <circle cx="63.5" cy="52" r="7" fill="none" stroke={EYE.fill} strokeWidth="4.5" />
            <circle cx="63.5" cy="52" r="2" {...EYE} />
          </>
        ) : (
          <>
            {pill(31)}
            {pill(58)}
          </>
        )}
      </g>

      {mood === "normal" && (
        <path d="M 39 68 Q 50 78 61 68" fill="none" stroke={EYE.fill} strokeWidth="4.5" strokeLinecap="round" />
      )}
      {mood === "thinking" && <ellipse cx="50" cy="73" rx="6.5" ry="5" {...EYE} />}
      {mood === "question" && (
        <text x="50" y="80" textAnchor="middle" fontSize="30" fontWeight={700} fill={EYE.fill}>
          ?
        </text>
      )}
      {mood === "decision" && (
        <text x="50" y="80" textAnchor="middle" fontSize="30" fontWeight={700} fill={EYE.fill}>
          !
        </text>
      )}
      {mood === "warning" && (
        <path d="M 43.5 77.5 L 50 66 L 56.5 77.5 Z" fill="none" stroke={EYE.fill} strokeWidth="4" strokeLinejoin="round" />
      )}
      {mood === "success" && (
        <path d="M 34 66 Q 50 81 66 66" fill="none" stroke={EYE.fill} strokeWidth="4.5" strokeLinecap="round" />
      )}
    </svg>
  );
}
