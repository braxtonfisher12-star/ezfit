// Progressive overload engine — spec sections 16-17.
// Pure functions: given exercise config + last performance, return today's target.
// No I/O here so this is trivially unit-testable.

export function nextReversePyramidTarget({ lastWeight, lastReps, repRangeLow, repRangeHigh, weightIncrement = 5 }) {
  if (lastReps >= repRangeHigh) {
    return {
      targetWeight: lastWeight + weightIncrement,
      targetRepsLow: repRangeLow,
      targetRepsHigh: repRangeLow,
      note: "Weight increased — back to the bottom of the rep range.",
    };
  }
  return {
    targetWeight: lastWeight,
    targetRepsLow: lastReps + 1,
    targetRepsHigh: lastReps + 1,
    note: "Same weight, one more rep than last time.",
  };
}

export function nextStraightSetTarget({ lastWeight, setsReps, repRangeHigh, weightIncrement = 5 }) {
  const allAtTop = setsReps.every((reps) => reps >= repRangeHigh);
  if (allAtTop) {
    return {
      targetWeight: lastWeight + weightIncrement,
      unlocked: true,
      note: "Weight unlocked — every set hit the top of the range.",
    };
  }
  return {
    targetWeight: lastWeight,
    unlocked: false,
    note: "Hold weight, chase one more rep on your weakest set.",
  };
}

export function isPR({ weight, reps, prevWeight, prevReps }) {
  if (weight > prevWeight) return true;
  if (weight === prevWeight && reps > prevReps) return true;
  return false;
}

export function detectPlateau(sessionHistory, { windowSize = 3 } = {}) {
  if (sessionHistory.length < windowSize) return { plateaued: false };
  const recent = sessionHistory.slice(-windowSize);
  const noImprovement = recent.every((s, i) => {
    if (i === 0) return true;
    const prev = recent[i - 1];
    return s.weight <= prev.weight && s.reps <= prev.reps;
  });
  return { plateaued: noImprovement, window: recent };
}
