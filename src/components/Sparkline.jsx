export default function Sparkline({ values, width = 70, height = 24, color = "var(--primary)" }) {
  if (!values || values.length < 2) {
    return <div style={{ width, height, display: "flex", alignItems: "center" }}><span className="muted" style={{ fontSize: 10 }}>—</span></div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / Math.max(1, max - min)) * height;
      return `${x},${y}`;
    })
    .join(" ");
  const trendingUp = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height}>
      <polyline points={path} fill="none" stroke={trendingUp ? "var(--success)" : color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
