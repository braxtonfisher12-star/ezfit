import { useEffect, useState } from "react";

const COLORS = ["#2B4CFF", "#3E8F5C", "#C6862A", "#7B5FD1", "#D1608F"];

export default function ConfettiBurst({ count = 36 }) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 300,
      duration: 1800 + Math.random() * 1200,
      color: COLORS[i % COLORS.length],
      rotate: Math.random() * 360,
      size: 6 + Math.random() * 6,
    }))
  );

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 60 }}>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            top: "-5%",
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confettiFall ${p.duration}ms ease-in ${p.delay}ms forwards`,
            borderRadius: 2,
          }}
        />
      ))}
      <style>{`
        @keyframes confettiFall {
          to { top: 105%; transform: rotate(${Math.random() * 720 - 360}deg); opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
