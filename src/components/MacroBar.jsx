import { pct } from "../lib/nutritionMath";

export default function MacroBar({ label, current, target, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row" style={{ fontSize: 12.5 }}>
        <span className="muted">{label}</span>
        <span style={{ fontFamily: "var(--font-mono)" }}>
          {Math.round(current)} / {target}g
        </span>
      </div>
      <div className="macroBar">
        <div className="macroFill" style={{ width: `${pct(current, target)}%`, background: color }} />
      </div>
    </div>
  );
}
