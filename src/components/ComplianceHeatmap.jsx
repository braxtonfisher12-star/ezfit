import { toISODate } from "../lib/dateUtils";

export default function ComplianceHeatmap({ weightDates, foodDates, stepsDates, weeks = 10 }) {
  const days = weeks * 7;
  const today = new Date();
  const cells = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = toISODate(d);
    const score = (weightDates.has(iso) ? 1 : 0) + (foodDates.has(iso) ? 1 : 0) + (stepsDates.has(iso) ? 1 : 0);
    cells.push({ iso, score, isFuture: d > today });
  }

  const colorFor = (score) => {
    if (score === 0) return "var(--surface-2)";
    if (score === 1) return "rgba(43,76,255,0.3)";
    if (score === 2) return "rgba(43,76,255,0.6)";
    return "var(--primary)";
  };

  const columns = [];
  for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7));

  return (
    <div>
      <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 4 }}>
        {columns.map((col, ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {col.map((cell) => (
              <div
                key={cell.iso}
                title={`${cell.iso}: ${cell.score}/3`}
                style={{ width: 11, height: 11, borderRadius: 3, background: cell.isFuture ? "transparent" : colorFor(cell.score) }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <span className="muted" style={{ fontSize: 10 }}>Less</span>
        {[0, 1, 2, 3].map((s) => (
          <div key={s} style={{ width: 10, height: 10, borderRadius: 2, background: colorFor(s) }} />
        ))}
        <span className="muted" style={{ fontSize: 10 }}>More</span>
      </div>
    </div>
  );
}
