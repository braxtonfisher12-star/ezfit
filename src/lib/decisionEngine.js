// Weekly / Coach decision engine. Extended with: goal-awareness (the same
// weight-up pattern means something different for a lean bulk than a cut),
// sleep/strength correlation (don't blame the plan for a recovery problem),
// and a self-calibrating step size (Coach nudges its own aggressiveness
// based on whether past accepted changes actually worked — see
// calibrateCalorieStep below).

const CALORIE_ADHERENCE_BAND = 0.1;
const STALL_WEEKS = 2;
const DEFAULT_STEP = 125;

export function checkDataSufficiency({ weighInsThisWeek, waistLogsThisWeek, comparableWorkouts }) {
  const missing = [];
  if (weighInsThisWeek < 3) missing.push(`${3 - weighInsThisWeek} more morning weigh-ins needed`);
  if (waistLogsThisWeek < 1) missing.push("Log this week's waist measurement");
  if (comparableWorkouts < 1) missing.push("Complete another comparable workout");
  return { sufficient: missing.length === 0, missing };
}

// Spec section 20-style reasoning: if strength looks like it's declining but
// sleep also dropped this week, the likely cause is recovery, not the diet
// or the program — so don't let it trigger a "more fuel" recommendation on
// its own.
function strengthDeclineExplainedBySleep(strengthTrend, sleepTrend) {
  return strengthTrend === "declining" && sleepTrend === "down";
}

export function evaluateWeek({
  avgCalories,
  calorieTarget,
  weightTrend,
  waistTrend,
  strengthTrend,
  sleepTrend,          // 'down' | 'flat' | 'up'
  goal,                 // 'lose_fat' | 'build_muscle' | 'recomp' | 'maintain'
  weeksSinceMovement,
  weightLossRatePctPerWeek,
  dataSufficiency,
  isDeloadWeek,
  calorieStep = DEFAULT_STEP,
}) {
  if (isDeloadWeek) {
    return {
      state: "yellow",
      title: "Deload week",
      message: "This week is an intentional deload — lighter and shorter on purpose.",
      recommendation: "Not evaluating for calorie changes this week.",
      calorieChange: 0,
    };
  }

  if (dataSufficiency && !dataSufficiency.sufficient) {
    return {
      state: "gray",
      title: "Need more data",
      message: dataSufficiency.missing.join(" · "),
      recommendation: "EZfit won't change your plan without enough evidence.",
      calorieChange: 0,
    };
  }

  const adherencePct = calorieTarget ? avgCalories / calorieTarget : 1;
  const isAdherent = Math.abs(1 - adherencePct) <= CALORIE_ADHERENCE_BAND;
  const recoveryExplainsDecline = strengthDeclineExplainedBySleep(strengthTrend, sleepTrend);

  if (!isAdherent && avgCalories > calorieTarget) {
    return {
      state: "orange",
      title: "Adherence first",
      message: `Target ${calorieTarget} kcal, actual average ${Math.round(avgCalories)} kcal.`,
      recommendation: "Hit your existing calorie target before reducing calories further.",
      calorieChange: 0,
    };
  }

  // Recovery-explained decline: flag it as a sleep issue, not a fueling
  // issue — don't recommend more calories just because sleep tanked.
  if (recoveryExplainsDecline) {
    return {
      state: "yellow",
      title: "Watching — likely recovery",
      message: "Strength dipped the same week average sleep dropped — that reads as a recovery issue, not a fueling or program issue.",
      recommendation: "Prioritize sleep this week before changing anything else.",
      calorieChange: 0,
    };
  }

  // BUILD MUSCLE: weight up + strength up is the plan working, not a
  // problem — the same pattern that would trigger "reduce intake" during a
  // cut is exactly the goal here.
  if (goal === "build_muscle") {
    if (weightTrend === "up" && (strengthTrend === "improving" || strengthTrend === "flat") && !isAdherent === false) {
      return {
        state: "green",
        title: "Keep going",
        message: "Gaining weight with strength improving — exactly what a lean bulk should look like.",
        recommendation: "No changes needed.",
        calorieChange: 0,
      };
    }
    if (weightTrend === "flat" && weeksSinceMovement >= STALL_WEEKS && isAdherent) {
      return {
        state: "blue",
        title: "Consider more fuel",
        message: "Weight has been flat for multiple weeks despite strong adherence — not enough surplus to build muscle.",
        recommendation: `Increase calories by ${calorieStep}/day.`,
        calorieChange: calorieStep,
      };
    }
    if (weightTrend === "up" && waistTrend === "up" && strengthTrend !== "improving") {
      return {
        state: "purple",
        title: "Small adjustment",
        message: "Gaining weight faster than strength is improving — likely gaining more fat than muscle.",
        recommendation: `Reduce calories by approximately ${calorieStep}/day.`,
        calorieChange: -calorieStep,
      };
    }
  }

  // MAINTAIN: the goal itself is stability — any real movement either way
  // is the signal, not weight loss specifically.
  if (goal === "maintain") {
    if (weightTrend === "flat") {
      return { state: "green", title: "Keep going", message: "Weight is stable — exactly the goal.", recommendation: "No changes needed.", calorieChange: 0 };
    }
    if (weightTrend === "up" && isAdherent) {
      return { state: "purple", title: "Small adjustment", message: "Weight has trended up while maintaining adherence.", recommendation: `Reduce calories by approximately ${calorieStep}/day.`, calorieChange: -calorieStep };
    }
    if (weightTrend === "down" && isAdherent) {
      return { state: "blue", title: "Consider more fuel", message: "Weight has trended down while maintaining adherence.", recommendation: `Increase calories by ${calorieStep}/day.`, calorieChange: calorieStep };
    }
  }

  // LOSE_FAT / RECOMP (default path) — the original logic, with the
  // strength-decline branch now gated by recoveryExplainsDecline above.
  if (weightTrend === "down" && weightLossRatePctPerWeek > 1 && strengthTrend === "declining") {
    return {
      state: "blue",
      title: "Consider more fuel",
      message: "Weight-loss rate is aggressive and gym performance has declined across multiple comparable sessions.",
      recommendation: `Increase calories by ${calorieStep}/day.`,
      calorieChange: calorieStep,
    };
  }

  if (weightTrend === "flat" && waistTrend === "flat" && weeksSinceMovement >= STALL_WEEKS && isAdherent) {
    return {
      state: "purple",
      title: "Small adjustment",
      message: "Weight and waist have remained unchanged for multiple weeks despite strong adherence.",
      recommendation: `Reduce calories by approximately ${calorieStep}/day.`,
      calorieChange: -calorieStep,
    };
  }

  if (weightTrend === "up" && strengthTrend === "improving" && waistTrend === "flat") {
    return {
      state: "yellow",
      title: "Watching",
      message: "Body weight and strength are increasing while waist remains stable.",
      recommendation: "Not enough evidence to change calories yet — collect another week of data.",
      calorieChange: 0,
    };
  }

  if (weightTrend === "up" && waistTrend === "up" && isAdherent) {
    return {
      state: "purple",
      title: "Reduce intake",
      message: "Weight and waist are both trending up with strong adherence.",
      recommendation: `Reduce calories by approximately ${calorieStep}–${calorieStep + 75}/day.`,
      calorieChange: -calorieStep,
    };
  }

  if ((weightTrend === "down" || (weightTrend === "flat" && waistTrend === "down")) && (strengthTrend === "improving" || strengthTrend === "flat")) {
    return {
      state: "green",
      title: "Keep going",
      message: "You're getting leaner while gym performance holds or improves.",
      recommendation: "No changes needed.",
      calorieChange: 0,
    };
  }

  return {
    state: "yellow",
    title: "Watching",
    message: "Progress has slowed, but there isn't enough evidence to change the plan.",
    recommendation: "Collect another week of data.",
    calorieChange: 0,
  };
}

// Coach's self-calibration: after any accepted increase/decrease, check ~2-3
// weeks later whether weight actually moved in the expected direction. If
// it didn't, the step was too small for this person — bump it up (capped)
// so future recommendations are more aggressive. This is the mechanism
// behind "Coach learns from what happened."
export function calibrateCalorieStep({ currentStep, priorAcceptedChange, weightTrendSinceChange }) {
  if (!priorAcceptedChange || priorAcceptedChange === 0) return { newStep: currentStep, recalibrated: false };

  const expectedDirection = priorAcceptedChange > 0 ? "up" : "down";
  const workedAsExpected = weightTrendSinceChange === expectedDirection;

  if (workedAsExpected) return { newStep: currentStep, recalibrated: false };

  const newStep = Math.min(250, currentStep + 25);
  return { newStep, recalibrated: true };
}

export function isNormalFluctuation(dailyWeight, sevenDayAverage, thresholdLb = 3) {
  return Math.abs(dailyWeight - sevenDayAverage) <= thresholdLb;
}

export function buildEvidence({ weightChangeLb, waistChangeIn, strengthTrend, calorieAdherencePct, trainingAdherencePct }) {
  return [
    { label: "Weight trend", value: `${weightChangeLb > 0 ? "+" : ""}${weightChangeLb} lb` },
    { label: "Waist", value: `${waistChangeIn > 0 ? "+" : ""}${waistChangeIn}"` },
    { label: "Strength", value: strengthTrend === "improving" ? "↑ Improving" : strengthTrend === "declining" ? "↓ Declining" : "→ Stable" },
    { label: "Nutrition adherence", value: `${calorieAdherencePct}%` },
    { label: "Training adherence", value: `${trainingAdherencePct}%` },
  ];
}

export function buildInsights({ prCount, workoutsCompleted, calorieDeltaFromTarget, sleepDeltaMinutes, recalibrated }) {
  const insights = [];
  if (prCount > 0 && workoutsCompleted > 0) {
    insights.push({ label: "Training", body: `You hit ${prCount} PR${prCount === 1 ? "" : "s"} across ${workoutsCompleted} workout${workoutsCompleted === 1 ? "" : "s"}.` });
  }
  if (calorieDeltaFromTarget != null) {
    insights.push({ label: "Nutrition", body: `You averaged ${Math.abs(Math.round(calorieDeltaFromTarget))} calories ${calorieDeltaFromTarget >= 0 ? "above" : "below"} your target.` });
  }
  if (sleepDeltaMinutes != null && Math.abs(sleepDeltaMinutes) >= 15) {
    insights.push({ label: "Recovery", body: `Average sleep ${sleepDeltaMinutes < 0 ? "decreased" : "increased"} by ${Math.abs(Math.round(sleepDeltaMinutes))} minutes.` });
  }
  if (recalibrated) {
    insights.push({ label: "Coach adjustment", body: "Last change didn't move things as expected, so future adjustments will be a bit larger." });
  }
  return insights.slice(0, 3);
}
