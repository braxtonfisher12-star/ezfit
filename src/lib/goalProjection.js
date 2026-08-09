// Turns "I want to go from 200 to 190 at a 1 lb/week rate" into a real
// projection: weeks to goal, target date, and a week-by-week point series
// for charting. Also estimates maintenance calories (Mifflin-St Jeor) so
// Coach can set a full starting plan without the user typing macros by hand.

export function computeGoalProjection({ currentWeight, targetWeight, rateLbPerWeek }) {
  const diff = currentWeight - targetWeight; // positive = losing, negative = gaining
  const rate = Math.max(0.1, Math.abs(rateLbPerWeek));
  const weeksToGoal = Math.max(1, Math.round(Math.abs(diff) / rate));
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + weeksToGoal * 7);

  const points = [];
  for (let w = 0; w <= weeksToGoal; w++) {
    const projected = currentWeight - (diff / weeksToGoal) * w;
    points.push(Math.round(projected * 10) / 10);
  }

  return { weeksToGoal, targetDate, points, isLoss: diff > 0 };
}

// Mifflin-St Jeor with a moderate activity multiplier (1.55) as a
// reasonable default — good enough for a starting point; the weekly review
// loop is what actually corrects it over time based on real results.
export function estimateMaintenanceCalories({ sex, ageYears, heightIn, weightLb }) {
  if (!ageYears || !heightIn || !weightLb) return 2200; // fallback if profile incomplete
  const weightKg = weightLb / 2.20462;
  const heightCm = heightIn * 2.54;
  const bmr = sex === "female"
    ? 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161
    : 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;
  return Math.round((bmr * 1.55) / 10) * 10;
}

// Deficit/surplus from the chosen rate: ~3500 kcal per pound per week.
export function dailyCalorieAdjustmentForRate(rateLbPerWeek, isLoss) {
  const dailyKcal = Math.round((Math.abs(rateLbPerWeek) * 3500) / 7 / 10) * 10;
  return isLoss ? -dailyKcal : dailyKcal;
}
