import { useRef, useState } from "react";

// Press-and-hold circular button. Fires onComplete once the user has held
// for `holdMs` (default 800ms) — filling a ring so the hold has visible
// progress instead of feeling like a dead button. Releasing early cancels.
export default function HoldButton({ label = "Hold to start", onComplete, holdMs = 800, size = 180 }) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const rafRef = useRef(null);
  const startRef = useRef(0);

  const tick = (ts) => {
    if (!startRef.current) startRef.current = ts;
    const elapsed = ts - startRef.current;
    const p = Math.min(1, elapsed / holdMs);
    setProgress(p);
    if (p >= 1) {
      setHolding(false);
      startRef.current = 0;
      onComplete?.();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const start = () => {
    setHolding(true);
    startRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  };

  const cancel = () => {
    setHolding(false);
    setProgress(0);
    startRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <button
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        style={{
          width: size, height: size, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)",
          position: "relative", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transform: holding ? "scale(0.96)" : "scale(1)", transition: "transform 120ms ease",
        }}
      >
        <svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="6" />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#fff" strokeWidth="6"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} strokeLinecap="round"
            style={{ transition: progress === 0 ? "stroke-dashoffset 150ms ease" : "none" }}
          />
        </svg>
        <div style={{ width: size - 40, height: size - 40, borderRadius: "50%", background: "#fff" }} />
      </button>
      <div style={{ color: "#fff", fontWeight: 600, fontFamily: "var(--font-body)", fontSize: 15 }}>{label}</div>
    </div>
  );
}
