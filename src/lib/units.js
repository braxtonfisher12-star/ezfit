export function lbToKg(lb) {
  return lb / 2.20462;
}
export function kgToLb(kg) {
  return kg * 2.20462;
}
export function toDisplayWeight(lbValue, unit) {
  if (lbValue == null) return null;
  return unit === "kg" ? Math.round(lbToKg(lbValue) * 10) / 10 : Math.round(lbValue * 10) / 10;
}
export function fromDisplayWeight(displayValue, unit) {
  const n = Number(displayValue);
  if (Number.isNaN(n)) return null;
  return unit === "kg" ? Math.round(kgToLb(n) * 10) / 10 : n;
}
export function unitLabel(unit) {
  return unit === "kg" ? "kg" : "lb";
}
