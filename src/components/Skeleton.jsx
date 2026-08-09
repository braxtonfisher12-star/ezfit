export default function Skeleton({ height = 16, width = "100%", radius = 8, style }) {
  return <div className="skeleton-block" style={{ height, width, borderRadius: radius, ...style }} />;
}
