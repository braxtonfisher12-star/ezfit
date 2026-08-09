import { useRef, useState } from "react";

export default function SwipeToDelete({ onDelete, children }) {
  const [dragX, setDragX] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(null);
  const dragging = useRef(false);

  const OPEN_X = -76;

  const onPointerDown = (e) => {
    startX.current = e.clientX;
    dragging.current = true;
  };
  const onPointerMove = (e) => {
    if (!dragging.current || startX.current == null) return;
    const delta = e.clientX - startX.current;
    const base = open ? OPEN_X : 0;
    const next = Math.min(0, Math.max(OPEN_X, base + delta));
    setDragX(next);
  };
  const endDrag = () => {
    dragging.current = false;
    startX.current = null;
    if (dragX < OPEN_X / 2) {
      setDragX(OPEN_X);
      setOpen(true);
    } else {
      setDragX(0);
      setOpen(false);
    }
  };

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--radius)", marginBottom: 6 }}>
      <div
        onClick={onDelete}
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: 76,
          background: "var(--critical)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >
        Delete
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={() => dragging.current && endDrag()}
        onClick={() => open && setDragX(0) & setOpen(false)}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging.current ? "none" : "transform 200ms ease",
          touchAction: "pan-y",
          position: "relative",
          background: "var(--surface)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
