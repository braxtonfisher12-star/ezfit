export function Card({ children, tight, style, ...rest }) {
  return (
    <div className={`card${tight ? " cardTight" : ""}`} style={style} {...rest}>
      {children}
    </div>
  );
}

export function Pill({ tone = "gray", children }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
