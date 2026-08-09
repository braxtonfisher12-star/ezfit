import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { sumMacros } from "../lib/nutritionMath";

// Aggregates everything the Today screen needs into one hook: today's body
// metric, today's meals + macro totals, today's recovery log, and today's
// scheduled workout (if any). Each piece degrades gracefully to null/empty
// so the UI can render its empty states instead of crashing.
export function useTodayData() {
  const { user } = useAuth();
  const [data, setData] = useState({
    bodyMetric: null,
    recovery: null,
    meals: [],
    macroTotals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    todaysSession: null,
    cardioCalories: 0,
    loading: true,
  });

  const load = useCallback(async () => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: metric }, { data: recovery }, { data: meals }, { data: session }, { data: cardio }] = await Promise.all([
      supabase.from("body_metrics").select("*").eq("user_id", user.id).eq("metric_date", today).maybeSingle(),
      supabase.from("recovery_logs").select("*").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      supabase
        .from("meals")
        .select("*, meal_items(*, food:foods(*))")
        .eq("user_id", user.id)
        .eq("meal_date", today),
      supabase
        .from("workout_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("session_date", today)
        .maybeSingle(),
      supabase.from("cardio_sessions").select("calories_burned").eq("user_id", user.id).eq("session_date", today),
    ]);

    const allItems = (meals ?? []).flatMap((m) => m.meal_items ?? []);
    const macroTotals = sumMacros(allItems);
    const cardioCalories = (cardio ?? []).reduce((sum, c) => sum + (c.calories_burned ?? 0), 0);

    setData({
      bodyMetric: metric,
      recovery,
      meals: meals ?? [],
      macroTotals,
      todaysSession: session,
      cardioCalories,
      loading: false,
    });
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...data, reload: load };
}
