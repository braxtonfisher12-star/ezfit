// Small pure helpers for macro math — used across Today, Food, and Profile.

export function remaining(target, consumed) {
  return Math.max(0, Math.round(target - consumed));
}

export function pct(consumed, target) {
  if (!target) return 0;
  return Math.min(100, Math.round((consumed / target) * 100));
}

export function sumMacros(items) {
  return items.reduce(
    (acc, it) => {
      const factor = it.quantity && it.food?.serving_qty ? it.quantity / it.food.serving_qty : 1;
      acc.calories += (it.food?.calories ?? 0) * factor;
      acc.protein_g += (it.food?.protein_g ?? 0) * factor;
      acc.carbs_g += (it.food?.carbs_g ?? 0) * factor;
      acc.fat_g += (it.food?.fat_g ?? 0) * factor;
      return acc;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

export function dailyScore({ workoutDone, calorieAdherencePct, proteinAdherencePct, stepsPct, sleepPct }) {
  const weights = { workout: 30, calories: 25, protein: 20, steps: 15, sleep: 10 };
  const score =
    (workoutDone ? weights.workout : 0) +
    (Math.min(100, calorieAdherencePct) / 100) * weights.calories +
    (Math.min(100, proteinAdherencePct) / 100) * weights.protein +
    (Math.min(100, stepsPct) / 100) * weights.steps +
    (Math.min(100, sleepPct) / 100) * weights.sleep;
  return Math.round(score);
}
