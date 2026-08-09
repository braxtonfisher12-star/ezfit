export default function MacroDonut({ proteinG, carbsG, fatG, size = 140, strokeWidth = 16, light = false }) {
  const proteinKcal = proteinG * 4;
  const carbsKcal = carbsG * 4;
  const fatKcal = fatG * 9;
  const total = proteinKcal + carbsKcal + fatKcal;

  const radius = size / 2 - strokeWidth / 2 - 2;
  const circumference = 2 * Math.PI * radius;

  const colors = light
    ? { protein: "#FFFFFF", carbs: "#FFD97A", fat: "#C9B8FF", track: "rgba(255,255,255,0.25)" }
    : { protein: "var(--protein)", carbs: "var(--carbs)", fat: "var(--fat)", track: "var(--surface-2)" };

  const segments = total > 0 ? [
    { value: proteinKcal, color: colors.protein },
    { value: carbsKcal, color: colors.carbs },
    { value: fatKcal, color: colors.fat },
  ] : [];

  let cumulative = 0;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.track} strokeWidth={strokeWidth} />
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const dash = frac * circumference;
          const offset = circumference * (1 - cumulative);
          cumulative += frac;
          return (
            <circle
              key={i} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={seg.color} strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={offset} strokeLinecap="butt"
              style={{ transition: "stroke-dasharray 700ms ease, stroke-dashoffset 700ms ease" }}
            />
          );
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div className="bigNum" style={{ fontSize: 20, color: light ? "#fff" : "var(--text)" }}>{Math.round(total)}</div>
        <div style={{ fontSize: 10, color: light ? "rgba(255,255,255,0.75)" : "var(--text-muted)" }}>kcal</div>
      </div>
    </div>
  );
}
