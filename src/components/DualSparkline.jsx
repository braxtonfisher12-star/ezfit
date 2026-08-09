export default function DualSparkline({ seriesA, seriesB, colorA = "var(--warning)", colorB = "var(--success)", width = 260, height = 60 }) {
  const buildPath = (series) => {
    if (!series || series.length < 2) return "";
    const min = Math.min(...series);
    const max = Math.max(...series);
    return series
      .map((v, i) => {
        const x = (i / (series.length - 1)) * width;
        const y = height - ((v - min) / Math.max(1, max - min)) * height;
        return `${x},${y}`;
      })
      .join(" ");
  };

  return (
    <div>
      <svg width={width} height={height}>
        <polyline points={buildPath(seriesA)} fill="none" stroke={colorA} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={buildPath(seriesB)} fill="none" stroke={colorB} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" />
      </svg>
      <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 2, background: colorA, display: "inline-block" }} />
          <span className="muted" style={{ fontSize: 10 }}>Sleep</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 2, background: colorB, display: "inline-block", borderTop: `2px dashed ${colorB}` }} />
          <span className="muted" style={{ fontSize: 10 }}>Strength</span>
        </div>
      </div>
    </div>
  );
}
