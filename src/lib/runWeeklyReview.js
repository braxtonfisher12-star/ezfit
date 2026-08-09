import { supabase } from "./supabaseClient";
import { evaluateWeek, checkDataSufficiency, buildEvidence, buildInsights, calibrateCalorieStep } from "./decisionEngine";

function trend(values) {
  if (values.length < 2) return "flat";
  const delta = values[values.length - 1] - values[0];
  if (delta < -0.3) return "down";
  if (delta > 0.3) return "up";
  return "flat";
}

export async function runWeeklyReviewNow(user) {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const priorWeekStart = new Date(weekStart);
  priorWeekStart.setDate(priorWeekStart.getDate() - 7);
  const priorWeekStartStr = priorWeekStart.toISOString().slice(0, 10);

  const [{ data: profile }, { data: metrics }, { data: targets }, { data: sessions }, { data: meals }, { data: thisWeekSets }, { data: priorWeekSets }, { data: recovery }, { data: priorRecovery }, { data: priorReview }, { data: recalibrationReview }] = await Promise.all([
    supabase.from("profiles").select("deload_week, goal, coach_calorie_step").eq("id", user.id).maybeSingle(),
    supabase.from("body_metrics").select("*").eq("user_id", user.id).gte("metric_date", weekStartStr).order("metric_date"),
    supabase.from("nutrition_targets").select("*").eq("user_id", user.id).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("workout_sessions").select("*").eq("user_id", user.id).gte("session_date", weekStartStr),
    supabase.from("meals").select("*, meal_items(*, food:foods(calories,protein_g,serving_qty))").eq("user_id", user.id).gte("meal_date", weekStartStr),
    supabase.from("sets").select("*").eq("user_id", user.id).gte("completed_at", weekStartStr),
    supabase.from("sets").select("*").eq("user_id", user.id).gte("completed_at", priorWeekStartStr).lt("completed_at", weekStartStr),
    supabase.from("recovery_logs").select("*").eq("user_id", user.id).gte("log_date", weekStartStr),
    supabase.from("recovery_logs").select("*").eq("user_id", user.id).gte("log_date", priorWeekStartStr).lt("log_date", weekStartStr),
    supabase.from("weekly_reviews").select("decision_state").eq("user_id", user.id).order("week_start", { ascending: false }).limit(1).maybeSingle(),
    // For self-calibration: the review from ~2-3 weeks ago that had an accepted, non-zero change.
    supabase.from("weekly_reviews").select("*").eq("user_id", user.id).eq("user_response", "accepted").neq("recommended_calorie_change", 0).order("week_start", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const weights = (metrics ?? []).filter((m) => m.weight_lb).map((m) => m.weight_lb);
  const waists = (metrics ?? []).filter((m) => m.waist_in).map((m) => m.waist_in);
  const avgWeight = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : null;
  const avgWaist = waists.length ? waists.reduce((a, b) => a + b, 0) / waists.length : null;

  const dailyCalories = {};
  const dailyProtein = {};
  for (const meal of meals ?? []) {
    const day = meal.meal_date;
    for (const item of meal.meal_items ?? []) {
      const factor = item.food?.serving_qty ? item.quantity / item.food.serving_qty : 1;
      dailyCalories[day] = (dailyCalories[day] || 0) + (item.food?.calories ?? 0) * factor;
      dailyProtein[day] = (dailyProtein[day] || 0) + (item.food?.protein_g ?? 0) * factor;
    }
  }
  const calorieVals = Object.values(dailyCalories);
  const avgCalories = calorieVals.length ? calorieVals.reduce((a, b) => a + b, 0) / calorieVals.length : 0;
  const proteinVals = Object.values(dailyProtein);
  const avgProtein = proteinVals.length ? proteinVals.reduce((a, b) => a + b, 0) / proteinVals.length : 0;

  const maxWeightByExercise = (sets) => {
    const map = {};
    for (const s of sets) map[s.exercise_id] = Math.max(map[s.exercise_id] ?? 0, s.actual_weight ?? 0);
    return map;
  };
  const thisMax = maxWeightByExercise(thisWeekSets ?? []);
  const priorMax = maxWeightByExercise(priorWeekSets ?? []);
  let progressiveOverloadLb = 0;
  let exercisesImproved = 0;
  for (const [exId, weight] of Object.entries(thisMax)) {
    if (priorMax[exId] != null && weight > priorMax[exId]) {
      progressiveOverloadLb += weight - priorMax[exId];
      exercisesImproved++;
    }
  }

  const strengthTrend = exercisesImproved > 0 ? "improving" : "flat";
  const weightTrendVal = trend(weights);
  const waistTrendVal = trend(waists);

  const sleepVals = (recovery ?? []).filter((r) => r.sleep_minutes).map((r) => r.sleep_minutes);
  const priorSleepVals = (priorRecovery ?? []).filter((r) => r.sleep_minutes).map((r) => r.sleep_minutes);
  const avgSleep = sleepVals.length ? sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length : null;
  const priorAvgSleep = priorSleepVals.length ? priorSleepVals.reduce((a, b) => a + b, 0) / priorSleepVals.length : null;
  const sleepTrendVal = avgSleep != null && priorAvgSleep != null ? trend([priorAvgSleep, avgSleep]) : "flat";

  const dataSufficiency = checkDataSufficiency({
    weighInsThisWeek: weights.length,
    waistLogsThisWeek: waists.length,
    comparableWorkouts: (sessions ?? []).filter((s) => s.status === "complete").length,
  });

  const wasFlatLastWeek = priorReview?.decision_state === "yellow" || priorReview?.decision_state === "purple";

  // Self-calibration: if the last accepted change should have moved weight
  // in a direction and it didn't, bump the step size for next time.
  let calorieStep = profile?.coach_calorie_step ?? 125;
  let recalibrated = false;
  if (recalibrationReview) {
    const { newStep, recalibrated: didRecalibrate } = calibrateCalorieStep({
      currentStep: calorieStep,
      priorAcceptedChange: recalibrationReview.recommended_calorie_change,
      weightTrendSinceChange: weightTrendVal,
    });
    if (didRecalibrate) {
      calorieStep = newStep;
      recalibrated = true;
      await supabase.from("profiles").update({ coach_calorie_step: newStep }).eq("id", user.id);
    }
  }

  const decision = evaluateWeek({
    avgCalories,
    calorieTarget: targets?.calories ?? 2200,
    weightTrend: weightTrendVal,
    waistTrend: waistTrendVal,
    strengthTrend,
    sleepTrend: sleepTrendVal,
    goal: profile?.goal ?? "recomp",
    weeksSinceMovement: weightTrendVal === "flat" && waistTrendVal === "flat" ? (wasFlatLastWeek ? 2 : 1) : 0,
    weightLossRatePctPerWeek: avgWeight && weights.length > 1 ? Math.abs((weights[weights.length - 1] - weights[0]) / weights[0]) * 100 : 0,
    dataSufficiency,
    isDeloadWeek: !!profile?.deload_week,
    calorieStep,
  });

  const calorieAdherencePct = targets?.calories ? Math.round(Math.min(100, 100 - (Math.abs(avgCalories - targets.calories) / targets.calories) * 100)) : null;
  const proteinAdherencePct = targets?.protein_g ? Math.round(Math.min(100, (avgProtein / targets.protein_g) * 100)) : null;
  const workoutsCompleted = (sessions ?? []).filter((s) => s.status === "complete").length;
  const prCount = (thisWeekSets ?? []).filter((s) => s.is_pr).length;

  const evidence = buildEvidence({
    weightChangeLb: weights.length > 1 ? Math.round((weights[weights.length - 1] - weights[0]) * 10) / 10 : 0,
    waistChangeIn: waists.length > 1 ? Math.round((waists[waists.length - 1] - waists[0]) * 10) / 10 : 0,
    strengthTrend,
    calorieAdherencePct: calorieAdherencePct ?? 0,
    trainingAdherencePct: (sessions ?? []).length ? Math.round((workoutsCompleted / (sessions ?? []).length) * 100) : 0,
  });

  const insights = buildInsights({
    prCount,
    workoutsCompleted,
    calorieDeltaFromTarget: targets?.calories ? avgCalories - targets.calories : null,
    sleepDeltaMinutes: avgSleep != null && priorAvgSleep != null ? avgSleep - priorAvgSleep : null,
    recalibrated,
  });

  const { data: inserted, error } = await supabase
    .from("weekly_reviews")
    .insert({
      user_id: user.id,
      week_start: weekStartStr,
      avg_weight_lb: avgWeight,
      avg_waist_in: avgWaist,
      weight_trend: weightTrendVal,
      waist_trend: waistTrendVal,
      strength_trend: strengthTrend,
      sleep_trend: sleepTrendVal,
      workouts_completed: workoutsCompleted,
      workouts_scheduled: (sessions ?? []).length,
      prs_count: prCount,
      avg_calories: avgCalories,
      calorie_target: targets?.calories ?? 2200,
      calorie_adherence_pct: calorieAdherencePct,
      protein_adherence_pct: proteinAdherencePct,
      avg_sleep_minutes: avgSleep,
      decision_state: decision.state,
      recommendation_text: decision.message ? `${decision.message} ${decision.recommendation}` : decision.recommendation,
      recommended_calorie_change: decision.calorieChange,
      evidence,
      insights,
      progressive_overload_lb: Math.round(progressiveOverloadLb),
      exercises_improved: exercisesImproved,
      is_deload_week: !!profile?.deload_week,
      recalibrated,
    })
    .select()
    .single();

  if (error) throw error;
  return inserted;
}
