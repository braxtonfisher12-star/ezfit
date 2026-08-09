import ConfettiBurst from "./ConfettiBurst";

export default function MilestoneCelebration({ milestone, onDismiss }) {
  if (!milestone) return null;
  return (
    <div onClick={onDismiss} style={{ position: "fixed", inset: 0, background: "rgba(18,36,91,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 70, cursor: "pointer" }}>
      <ConfettiBurst />
      <div style={{ fontSize: 44, marginBottom: 14 }}>🏆</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Milestone reached</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26, color: "#fff", margin: "8px 0 20px", textAlign: "center", padding: "0 30px" }}>{milestone.label}</div>
      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>Tap anywhere to continue</div>
    </div>
  );
}
