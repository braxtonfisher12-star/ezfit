import Sparkline from "./Sparkline";

export default function StatTile({ label, value, values, color = "var(--primary)" }) {
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "10px 12px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, margin: "3px 0 4px" }}>{value}</div>
      <Sparkline values={values} width={64} height={18} color={color} />
    </div>
  );
}
