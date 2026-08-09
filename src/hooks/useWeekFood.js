import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { getWeekDates, toISODate } from "../lib/dateUtils";
import { sumMacros } from "../lib/nutritionMath";

// Loads every meal (with items) across a Sun-Sat week in one query, plus
// per-day macro totals for the MacroFactor-style week strip.
export function useWeekFood(anchor = new Date()) {
  const { user } = useAuth();
  const [mealsByDate, setMealsByDate] = useState({});
  const [cardioByDate, setCardioByDate] = useState({});
  const [loading, setLoading] = useState(true);

  const week = getWeekDates(anchor);
  const weekStartISO = toISODate(week[0]);
  const weekEndISO = toISODate(week[6]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data }, { data: cardio }] = await Promise.all([
      supabase
        .from("meals")
        .select("*, meal_items(*, food:foods(*))")
        .eq("user_id", user.id)
        .gte("meal_date", weekStartISO)
        .lte("meal_date", weekEndISO),
      supabase
        .from("cardio_sessions")
        .select("session_date, calories_burned")
        .eq("user_id", user.id)
        .gte("session_date", weekStartISO)
        .lte("session_date", weekEndISO),
    ]);

    const grouped = {};
    for (const m of data ?? []) {
      grouped[m.meal_date] = grouped[m.meal_date] || [];
      grouped[m.meal_date].push(m);
    }
    setMealsByDate(grouped);

    const cardioGrouped = {};
    for (const c of cardio ?? []) {
      cardioGrouped[c.session_date] = (cardioGrouped[c.session_date] || 0) + (c.calories_burned ?? 0);
    }
    setCardioByDate(cardioGrouped);

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, weekStartISO, weekEndISO]);

  useEffect(() => {
    load();
  }, [load]);

  const totalsForDate = (isoDate) => {
    const meals = mealsByDate[isoDate] ?? [];
    const items = meals.flatMap((m) => m.meal_items ?? []);
    return sumMacros(items);
  };

  const cardioForDate = (isoDate) => cardioByDate[isoDate] ?? 0;

  return { week, mealsByDate, totalsForDate, cardioForDate, loading, reload: load };
}
