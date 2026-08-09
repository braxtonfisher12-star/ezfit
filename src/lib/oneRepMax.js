export function estimatedOneRepMax(weight, reps) {
  if (!weight || !reps) return 0;
  return Math.round(weight * (1 + reps / 30));
}

export function applyDeload(target, isDeload) {
  if (!isDeload) return target;
  return {
    ...target,
    targetSets: Math.max(1, Math.ceil((target.targetSets ?? 3) * 0.6)),
    targetWeight: target.targetWeight ? Math.round(target.targetWeight * 0.9) : target.targetWeight,
    note: "Deload week — lighter and shorter on purpose.",
  };
}