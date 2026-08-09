export default function RingProgress({ value, max, size = 140, strokeWidth = 12, color = "var(--primary)", trackColor, children }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const radius = size / 2 - strokeWidth / 2 - 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor || "var(--surface-2)"} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1), stroke 300ms ease" }}
        />
      </svg>
      <div style={{ position: "relative", textAlign: "center" }}>{children}</div>
    </div>
  );
}
