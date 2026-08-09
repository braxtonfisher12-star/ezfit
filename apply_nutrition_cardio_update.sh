mkdir -p src/components src/pages src/hooks

cat > src/components/RingProgress.jsx <<'PASTE_EOF'
// Reusable static SVG progress ring — used for the calorie circle at the top
// of Today and the smaller per-macro rings in the four-quadrant snippet.
export default function RingProgress({ value, max, size = 140, strokeWidth = 12, color = "var(--primary)", trackColor, children }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const radius = size / 2 - strokeWidth / 2 - 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor || "var(--surface-2)"} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)} strokeLinecap="round"
        />
      </svg>
      <div style={{ position: "relative", textAlign: "center" }}>{children}</div>
    </div>
  );
}
PASTE_EOF

cat > src/hooks/useTodayData.js <<'PASTE_EOF'
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
PASTE_EOF

cat > src/hooks/useWeekFood.js <<'PASTE_EOF'
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
PASTE_EOF

cat > src/pages/CardioLog.jsx <<'PASTE_EOF'
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

// Logs a cardio session with a manually entered calories-burned figure.
// That figure gets added to today's calorie budget wherever it's shown
// (Today's ring, Food's target) — see cardioCalories in useTodayData and
// cardioForDate in useWeekFood. Deliberately manual: EZfit doesn't estimate
// calorie burn itself, since wearable/formula estimates aren't exact
// (Coach spec rule 12) and a wrong estimate here would silently distort the
// whole day's nutrition math.
export default function CardioLog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activity, setActivity] = useState("");
  const [duration, setDuration] = useState("");
  const [calories, setCalories] = useState("");

  const submit = async () => {
    if (!activity || !calories) return;
    await supabase.from("cardio_sessions").insert({
      user_id: user.id,
      session_date: new Date().toISOString().slice(0, 10),
      activity_name: activity,
      duration_minutes: duration ? Number(duration) : null,
      calories_burned: Number(calories),
    });
    navigate("/today");
  };

  return (
    <div className="content">
      <h1 className="pageTitle" style={{ fontSize: 22 }}>Log cardio</h1>
      <p className="muted">This adds to today's calorie budget — burn 300, your target goes up by 300.</p>
      <div className="field"><label>Activity</label><input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Run, bike, rower…" /></div>
      <div className="field"><label>Duration (minutes)</label><input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Optional" /></div>
      <div className="field"><label>Calories burned</label><input value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="e.g. 300" /></div>
      <button className="btnPrimary" onClick={submit} disabled={!activity || !calories}>Add to today</button>
    </div>
  );
}
PASTE_EOF

cat > src/pages/Train.jsx <<'PASTE_EOF'
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import AvatarLink from "../components/AvatarLink";
import { Card, Pill } from "../components/Card";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { getWeekDates, toISODate, dayLabel } from "../lib/dateUtils";

// Week view: seven days, each showing its assigned template name (or Rest,
// or "+ Build" if nothing's assigned to that weekday yet). Tapping a day
// with a workout goes to the full-screen hold-to-start view for that date.
export default function Train() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [templates, setTemplates] = useState({});
  const [completedDates, setCompletedDates] = useState(new Set());

  const week = getWeekDates();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: a } = await supabase.from("workout_day_assignments").select("*, workout_templates(name)").eq("user_id", user.id);
      setAssignments(a ?? []);
      const map = {};
      (a ?? []).forEach((row) => { map[row.day_of_week] = row; });
      setTemplates(map);

      const { data: sessions } = await supabase
        .from("workout_sessions")
        .select("session_date")
        .eq("user_id", user.id)
        .eq("status", "complete")
        .gte("session_date", toISODate(week[0]))
        .lte("session_date", toISODate(week[6]));
      setCompletedDates(new Set((sessions ?? []).map((s) => s.session_date)));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <>
      <div className="content">
        <div className="row">
          <h1 className="pageTitle">Train</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btnGhost" style={{ width: "auto", padding: "8px 12px", fontSize: 12.5 }} onClick={() => navigate("/train/cardio")}>
              + Log cardio
            </button>
            <button className="btnGhost" style={{ width: "auto", padding: "8px 14px", fontSize: 12.5 }} onClick={() => navigate("/train/builder")}>
              + Build workout
            </button>
            <AvatarLink />
          </div>
        </div>
        <p className="muted">What do you need to beat today?</p>

        {week.map((d) => {
          const iso = toISODate(d);
          const isToday = iso === toISODate(new Date());
          const assignment = templates[d.getDay()];
          const done = completedDates.has(iso);
          return (
            <Card
              key={iso}
              tight
              onClick={() => assignment && navigate(`/train/day/${iso}`)}
              style={{
                cursor: assignment ? "pointer" : "default",
                borderColor: isToday ? "var(--primary)" : "var(--border)",
                background: isToday ? "var(--primary-tint)" : "var(--surface)",
              }}
            >
              <div className="row">
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{dayLabel(d)} {d.getDate()}</div>
                  <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: 2 }}>{assignment ? assignment.workout_templates?.name : "Rest day"}</div>
                </div>
                {done ? <Pill tone="green">Done</Pill> : assignment ? <Pill tone="blue">{isToday ? "Today" : "Scheduled"}</Pill> : <Pill tone="gray">—</Pill>}
              </div>
            </Card>
          );
        })}

        {assignments.length === 0 && (
          <Card>
            <div className="muted">No workouts built yet. Tap "+ Build workout" to create your first one and assign it to training days.</div>
          </Card>
        )}
      </div>
      <BottomNav />
    </>
  );
}
PASTE_EOF

cat > src/App.jsx <<'PASTE_EOF'
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { useProfile } from "./hooks/useProfile";

import SignIn from "./pages/SignIn";
import Onboarding from "./pages/onboarding/Onboarding";
import Today from "./pages/Today";
import Train from "./pages/Train";
import TrainDay from "./pages/TrainDay";
import TrainActive from "./pages/TrainActive";
import TrainComplete from "./pages/TrainComplete";
import WorkoutBuilder from "./pages/WorkoutBuilder";
import CardioLog from "./pages/CardioLog";
import Food from "./pages/Food";
import FoodAdd from "./pages/FoodAdd";
import Progress from "./pages/Progress";
import Profile from "./pages/Profile";
import CoachHome from "./pages/coach/CoachHome";
import ProgramBuilder from "./pages/coach/ProgramBuilder";

function Gate({ children }) {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  if (loading || (user && profileLoading)) {
    return <div className="app"><div className="content">Loading…</div></div>;
  }
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!profile?.onboarded) return <Navigate to="/onboarding" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/today" element={<Gate><Today /></Gate>} />
          <Route path="/train" element={<Gate><Train /></Gate>} />
          <Route path="/train/builder" element={<Gate><WorkoutBuilder /></Gate>} />
          <Route path="/train/cardio" element={<Gate><CardioLog /></Gate>} />
          <Route path="/train/day/:date" element={<Gate><TrainDay /></Gate>} />
          <Route path="/train/active" element={<Gate><TrainActive /></Gate>} />
          <Route path="/train/complete" element={<Gate><TrainComplete /></Gate>} />
          <Route path="/food" element={<Gate><Food /></Gate>} />
          <Route path="/food/add" element={<Gate><FoodAdd /></Gate>} />
          <Route path="/progress" element={<Gate><Progress /></Gate>} />
          <Route path="/profile" element={<Gate><Profile /></Gate>} />
          <Route path="/coach" element={<Gate><CoachHome /></Gate>} />
          <Route path="/coach/builder" element={<Gate><ProgramBuilder /></Gate>} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
PASTE_EOF

cat > src/pages/Food.jsx <<'PASTE_EOF'
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import AvatarLink from "../components/AvatarLink";
import { Card } from "../components/Card";
import MacroBar from "../components/MacroBar";
import { useWeekFood } from "../hooks/useWeekFood";
import { useProfile } from "../hooks/useProfile";
import { pct } from "../lib/nutritionMath";
import { toISODate, dayLabel, HOUR_SLOTS, formatHourSlot, slotKey } from "../lib/dateUtils";

// MacroFactor-style layout: a 7-day strip you toggle across the top, an hourly
// 5am-12am timeline underneath for the selected day (spec request), rather
// than the old breakfast/lunch/dinner/snacks buckets.
export default function Food() {
  const { targets } = useProfile();
  const { week, mealsByDate, totalsForDate, cardioForDate, loading, reload } = useWeekFood();
  const [selected, setSelected] = useState(toISODate(new Date()));
  const navigate = useNavigate();

  if (loading) return <div className="content">Loading…</div>;

  const baseCalTarget = targets?.calories ?? 2200;
  const cardioToday = cardioForDate(selected);
  const calTarget = baseCalTarget + cardioToday;
  const dayMeals = mealsByDate[selected] ?? [];
  const totals = totalsForDate(selected);

  const itemsForHour = (hour) => {
    const key = slotKey(hour);
    return dayMeals.filter((m) => (m.logged_time ?? "").slice(0, 2) === key.slice(0, 2)).flatMap((m) => m.meal_items ?? []);
  };

  return (
    <>
      <div className="content">
        <div className="row"><h1 className="pageTitle">Food</h1><AvatarLink /></div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
          {week.map((d) => {
            const iso = toISODate(d);
            const dayTotals = totalsForDate(iso);
            const isSelected = iso === selected;
            const dayTarget = baseCalTarget + cardioForDate(iso);
            const onTarget = dayTarget ? Math.abs(dayTotals.calories - dayTarget) / dayTarget < 0.1 : false;
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                style={{
                  flex: "1 0 auto",
                  minWidth: 44,
                  padding: "8px 4px",
                  borderRadius: 12,
                  border: isSelected ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                  background: isSelected ? "var(--primary-tint)" : "var(--surface)",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{dayLabel(d)}</div>
                <div style={{ fontWeight: 700, fontSize: 14, margin: "2px 0" }}>{d.getDate()}</div>
                <div style={{ width: 5, height: 5, borderRadius: "50%", margin: "0 auto", background: dayTotals.calories === 0 ? "var(--border)" : onTarget ? "var(--success)" : "var(--warning)" }} />
              </button>
            );
          })}
        </div>

        <Card>
          <div className="row" style={{ alignItems: "baseline" }}>
            <span className="bigNum" style={{ fontSize: 26 }}>{Math.round(totals.calories)}</span>
            <span className="muted">/ {calTarget} kcal</span>
          </div>
          {cardioToday > 0 && (
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
              Includes +{cardioToday} kcal from cardio ({baseCalTarget} base target)
            </div>
          )}
          <div className="progressTrack" style={{ margin: "8px 0 12px" }}>
            <div className="progressFill" style={{ width: `${pct(totals.calories, calTarget)}%` }} />
          </div>
          <MacroBar label="Protein" current={totals.protein_g} target={targets?.protein_g ?? 180} color="var(--protein)" />
          <MacroBar label="Carbs" current={totals.carbs_g} target={targets?.carbs_g ?? 200} color="var(--carbs)" />
          <MacroBar label="Fat" current={totals.fat_g} target={targets?.fat_g ?? 70} color="var(--fat)" />
        </Card>

        <div className="eyebrow" style={{ marginTop: 4 }}>Timeline</div>
        {HOUR_SLOTS.map((hour) => {
          const items = itemsForHour(hour);
          return (
            <div key={hour} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 52, flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", paddingTop: 12 }}>
                {formatHourSlot(hour)}
              </div>
              <div style={{ flex: 1 }}>
                {items.length === 0 ? (
                  <button
                    onClick={() => navigate("/food/add", { state: { date: selected, hour: slotKey(hour) } })}
                    style={{ width: "100%", textAlign: "left", background: "none", border: "1px dashed var(--border)", borderRadius: 12, padding: "10px 12px", color: "var(--text-faint)", fontSize: 12.5, cursor: "pointer" }}
                  >
                    + Log food
                  </button>
                ) : (
                  <div className="card cardTight" style={{ cursor: "pointer" }} onClick={() => navigate("/food/add", { state: { date: selected, hour: slotKey(hour) } })}>
                    {items.map((it) => (
                      <div className="row" key={it.id} style={{ fontSize: 13 }}>
                        <span>{it.food?.name}</span>
                        <span className="muted">{Math.round((it.food?.calories ?? 0) * (it.food?.serving_qty ? it.quantity / it.food.serving_qty : 1))} kcal</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <BottomNav />
    </>
  );
}
PASTE_EOF

cat > src/pages/Today.jsx <<'PASTE_EOF'
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toISODate } from "../lib/dateUtils";
import BottomNav from "../components/BottomNav";
import AvatarLink from "../components/AvatarLink";
import RingProgress from "../components/RingProgress";
import { Card, Pill } from "../components/Card";
import { useTodayData } from "../hooks/useTodayData";
import { useProfile } from "../hooks/useProfile";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { remaining, pct, dailyScore } from "../lib/nutritionMath";

export default function Today() {
  const { user } = useAuth();
  const { profile, targets } = useProfile();
  const { bodyMetric, recovery, macroTotals, todaysSession, cardioCalories, loading, reload } = useTodayData();
  const navigate = useNavigate();
  const [weightInput, setWeightInput] = useState("");
  const [stepsInput, setStepsInput] = useState("");

  const logWeight = async () => {
    if (!weightInput) return;
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("body_metrics").upsert({ user_id: user.id, metric_date: today, weight_lb: Number(weightInput) });
    setWeightInput("");
    reload();
  };

  const logSteps = async () => {
    if (!stepsInput) return;
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("recovery_logs").upsert({ user_id: user.id, log_date: today, steps: Number(stepsInput) });
    setStepsInput("");
    reload();
  };

  if (loading) return <div className="content">Loading today…</div>;

  // Cardio burned today bumps the calorie budget up — burn 300, target goes
  // from 2200 to 2500 (spec: "extra overexpenditure").
  const baseCalTarget = targets?.calories ?? 2200;
  const calTarget = baseCalTarget + cardioCalories;
  const proteinTarget = targets?.protein_g ?? 180;
  const carbTarget = targets?.carbs_g ?? 200;
  const fatTarget = targets?.fat_g ?? 70;
  const proteinRemaining = remaining(proteinTarget, macroTotals.protein_g);
  const stepGoal = profile?.step_goal ?? 10000;
  const steps = recovery?.steps ?? 0;

  const score = dailyScore({
    workoutDone: todaysSession?.status === "complete",
    calorieAdherencePct: pct(macroTotals.calories, calTarget),
    proteinAdherencePct: pct(macroTotals.protein_g, proteinTarget),
    stepsPct: pct(steps, stepGoal),
    sleepPct: pct(recovery?.sleep_minutes ?? 0, 480),
  });

  const quadrants = [
    { label: "Calories", current: macroTotals.calories, target: calTarget, unit: "", color: "var(--primary)" },
    { label: "Protein", current: macroTotals.protein_g, target: proteinTarget, unit: "g", color: "var(--protein)" },
    { label: "Fat", current: macroTotals.fat_g, target: fatTarget, unit: "g", color: "var(--fat)" },
    { label: "Carbs", current: macroTotals.carbs_g, target: carbTarget, unit: "g", color: "var(--carbs)" },
  ];

  return (
    <>
      <div className="content">
        <div className="row">
          <div>
            <h1 className="pageTitle" style={{ marginBottom: 0 }}>
              Good morning, {profile?.display_name || "there"}
            </h1>
            <div className="muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Pill tone="green">On track</Pill>
            <AvatarLink />
          </div>
        </div>

        {/* Daily Nutrition — hero ring for calories, macros listed below */}
        <Card>
          <div className="row" style={{ marginBottom: 4 }}>
            <span className="eyebrow" style={{ margin: 0 }}>Daily nutrition</span>
            {cardioCalories > 0 && <Pill tone="blue">+{cardioCalories} kcal from cardio</Pill>}
          </div>
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
            <RingProgress value={macroTotals.calories} max={calTarget} size={150} strokeWidth={13} color="var(--primary)">
              <div className="bigNum" style={{ fontSize: 26 }}>{Math.round(macroTotals.calories)}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>of {calTarget} kcal</div>
            </RingProgress>
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 6 }}>
            {[
              { label: "Protein", current: macroTotals.protein_g, target: proteinTarget, color: "var(--protein)" },
              { label: "Carbs", current: macroTotals.carbs_g, target: carbTarget, color: "var(--carbs)" },
              { label: "Fat", current: macroTotals.fat_g, target: fatTarget, color: "var(--fat)" },
            ].map((m) => (
              <div key={m.label} style={{ textAlign: "center" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, margin: "0 auto 4px" }} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600 }}>{Math.round(m.current)}<span style={{ color: "var(--text-muted)" }}>/{m.target}g</span></div>
                <div className="muted" style={{ fontSize: 10.5 }}>{m.label}</div>
              </div>
            ))}
          </div>
          <button className="btnGhost" style={{ marginTop: 14 }} onClick={() => navigate("/food/add")}>Add food</button>
        </Card>

        <Card>
          <div style={{ display: "flex", gap: 22 }}>
            <div style={{ flex: 1 }}>
              <div className="eyebrow">Today's weight</div>
              {bodyMetric?.weight_lb ? (
                <div className="bigNum" style={{ fontSize: 26 }}>{bodyMetric.weight_lb} <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-muted)" }}>lb</span></div>
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input placeholder="lb" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} style={{ width: 70, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
                  <button className="btnGhost" style={{ width: "auto", padding: "8px 12px" }} onClick={logWeight}>Log</button>
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div className="eyebrow">Sleep</div>
              <div className="bigNum" style={{ fontSize: 26 }}>
                {recovery?.sleep_minutes ? `${Math.floor(recovery.sleep_minutes / 60)}h ${recovery.sleep_minutes % 60}m` : "—"}
              </div>
            </div>
          </div>
        </Card>

        {todaysSession ? (
          <Card style={{ background: "var(--primary)", color: "#fff", border: "none" }}>
            <div className="row"><div className="eyebrow" style={{ color: "#C9D4FF" }}>{todaysSession.day_label}</div></div>
            <button
              style={{ width: "100%", marginTop: 14, background: "#fff", color: "var(--primary-ink)", border: "none", borderRadius: 14, padding: 14, fontWeight: 700, cursor: "pointer" }}
              onClick={() => navigate(`/train/day/${toISODate(new Date())}`)}
            >
              Start workout
            </button>
          </Card>
        ) : (
          <Card>
            <div className="eyebrow">Recovery day</div>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, margin: "4px 0 6px" }}>Recovery is part of training.</p>
            <div className="muted">{steps} / {stepGoal} steps · nutrition targets · 8+ hours sleep</div>
          </Card>
        )}

        <Card>
          <div className="row"><span className="eyebrow" style={{ margin: 0 }}>Steps</span><span className="muted" style={{ fontFamily: "var(--font-mono)" }}>{steps} / {stepGoal}</span></div>
          <div className="progressTrack" style={{ marginTop: 8 }}><div className="progressFill" style={{ width: `${pct(steps, stepGoal)}%`, background: "var(--success)" }} /></div>
          {steps === 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <input placeholder="Enter today's steps" value={stepsInput} onChange={(e) => setStepsInput(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
              <button className="btnGhost" style={{ width: "auto", padding: "8px 12px" }} onClick={logSteps}>Log</button>
            </div>
          )}
        </Card>

        <Card>
          <div className="eyebrow" style={{ margin: 0 }}>Today's score</div>
          <div className="bigNum" style={{ fontSize: 30 }}>{score}<span style={{ fontSize: 15, color: "var(--text-muted)", fontWeight: 500 }}>/100</span></div>
        </Card>

        {/* Four-quadrant nutrition snippet, right under the score */}
        <Card>
          <div className="eyebrow">Nutrition snapshot</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 8 }}>
            {quadrants.map((q) => (
              <div key={q.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <RingProgress value={q.current} max={q.target} size={54} strokeWidth={6} color={q.color} />
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{q.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{Math.round(q.current)}{q.unit}<span style={{ color: "var(--text-muted)", fontWeight: 400 }}>/{q.target}{q.unit}</span></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <BottomNav />
    </>
  );
}
PASTE_EOF

