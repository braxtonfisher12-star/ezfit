const SCALE = "M12 3v2M5 5h14l-1.5 8a5.5 5.5 0 01-11 0L5 5z M9 9l1.5 3M15 9l-1.5 3";
const CALENDAR = "M4 5h16v16H4V5z M4 9h16 M8 3v4 M16 3v4";
const FLAME = "M12 2c1 4-4 5-4 9a4 4 0 008 0c0-2-1-3-1-5 2 1 3 3 3 5a6 6 0 01-12 0c0-5 4-6 6-9z";
const DUMBBELL = "M6.5 8.5v7M4 10v4M2 11.5v1M17.5 8.5v7M20 10v4M22 11.5v1M8 12h8";

const ICONS = { scale: SCALE, calendar: CALENDAR, flame: FLAME, dumbbell: DUMBBELL };

function StripIcon({ kind, color }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" style={{ marginBottom: 3 }}>
      <path d={ICONS[kind]} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function JourneyStrip({ totalChangeLb, weeksTrained, longestStreak, totalOverloadLb }) {
  const stats = [
    { label: totalChangeLb <= 0 ? "Lost" : "Gained", value: `${Math.abs(totalChangeLb)} lb`, icon: "scale", color: "var(--primary)", bg: "var(--primary-tint)" },
    { label: "Weeks trained", value: weeksTrained, icon: "calendar", color: "var(--success)", bg: "var(--success-tint)" },
    { label: "Best streak", value: `${longestStreak}d`, icon: "flame", color: "var(--warning)", bg: "var(--warning-tint)" },
    { label: "Lifetime overload", value: `+${totalOverloadLb} lb`, icon: "dumbbell", color: "var(--fat)", bg: "rgba(123,95,209,0.1)" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {stats.map((s) => (
        <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 12, padding: "10px 4px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}><StripIcon kind={s.icon} color={s.color} /></div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14.5, color: s.color }}>{s.value}</div>
          <div className="muted" style={{ fontSize: 9, marginTop: 1 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}
