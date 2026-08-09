export function computePace({ goalStartWeightLb, goalStartDate, goalWeightLb, goalRateLbPerWeek, currentWeightLb }) {
  if (goalStartWeightLb == null || !goalStartDate || goalWeightLb == null || currentWeightLb == null) return null;

  const isLoss = goalStartWeightLb > goalWeightLb;
  const daysElapsed = Math.max(0, (new Date() - new Date(goalStartDate + "T00:00:00")) / 86400000);
  const weeksElapsed = daysElapsed / 7;
  const rate = Math.max(0.1, Math.abs(goalRateLbPerWeek || 1));
  const expectedChange = rate * weeksElapsed * (isLoss ? -1 : 1);
  const expectedWeight = goalStartWeightLb + expectedChange;

  const diff = currentWeightLb - expectedWeight;
  const aheadOfPace = isLoss ? diff < -0.5 : diff > 0.5;
  const behindPace = isLoss ? diff > 0.5 : diff < -0.5;

  return {
    expectedWeight: Math.round(expectedWeight * 10) / 10,
    diffLb: Math.round(Math.abs(diff) * 10) / 10,
    status: aheadOfPace ? "ahead" : behindPace ? "behind" : "on_pace",
  };
}
