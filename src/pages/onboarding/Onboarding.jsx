import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useProfile } from "../../hooks/useProfile";
import { supabase } from "../../lib/supabaseClient";

// Collapsed onboarding — spec sections 5.1-5.8 condensed into one flow with
// a step index. Writes the profile, an initial nutrition_targets row, and a
// default 3-day training_programs row (Upper / Lower / Upper, spec sec 6) on
// the final step, then flips profiles.onboarded so App's <Gate> lets them in.
const STEPS = ["welcome", "goal", "body", "training", "nutrition", "calibration"];

export default function Onboarding() {
  const { user, signUp, signIn } = useAuth();
  const { saveProfile, saveTargets } = useProfile();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    email: "", password: "",
    display_name: "", goal: "recomp",
    sex: "male", age_years: "", height_in: "", weight_lb: "", waist_in: "",
    training_days_per_week: 3,
    calories: 2200, protein_g: 195, carbs_g: 185, fat_g: 75,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));

  const finish = async () => {
    let currentUser = user;
    if (!currentUser) {
      const { data, error } = await signUp(form.email, form.password);
      if (error) return alert(error.message);
      currentUser = data.user;
    }

    await saveProfile({
      display_name: form.display_name,
      goal: form.goal,
      sex: form.sex,
      age_years: Number(form.age_years) || null,
      height_in: Number(form.height_in) || null,
      goal_weight_lb: null,
      training_days_per_week: Number(form.training_days_per_week),
      onboarded: true,
    });

    await saveTargets({
      calories: Number(form.calories),
      protein_g: Number(form.protein_g),
      carbs_g: Number(form.carbs_g),
      fat_g: Number(form.fat_g),
      reason: "Initial onboarding targets",
    });

    if (form.weight_lb || form.waist_in) {
      await supabase.from("body_metrics").upsert({
        user_id: currentUser.id,
        metric_date: new Date().toISOString().slice(0, 10),
        weight_lb: Number(form.weight_lb) || null,
        waist_in: Number(form.waist_in) || null,
      });
    }

    // Default Upper / Lower / Upper split on Mon/Wed/Fri, built on the same
    // workout_templates + workout_day_assignments tables the builder uses,
    // so a new user's Train tab is populated on day one, not empty.
    const { data: globalExercises } = await supabase.from("exercises").select("*").eq("is_global", true);
    const byCategory = (cat) => globalExercises?.filter((e) => e.category === cat) ?? [];

    const defaultSplit = [
      { day: 1, name: "Upper A", exercises: globalExercises?.filter((e) => ["push", "pull", "arms"].includes(e.category)) ?? [] },
      { day: 3, name: "Lower", exercises: byCategory("legs") },
      { day: 5, name: "Upper B", exercises: globalExercises?.filter((e) => ["push", "pull", "shoulders"].includes(e.category)) ?? [] },
    ];

    for (const split of defaultSplit) {
      if (split.exercises.length === 0) continue;
      const { data: template } = await supabase.from("workout_templates").insert({ user_id: currentUser.id, name: split.name }).select().single();
      await supabase.from("workout_template_exercises").insert(
        split.exercises.map((ex, i) => ({
          template_id: template.id,
          exercise_id: ex.id,
          order_index: i,
          target_sets: 3,
          target_reps_low: ex.rep_range_low,
          target_reps_high: ex.rep_range_high,
          rest_seconds: ex.rest_seconds,
        }))
      );
      await supabase.from("workout_day_assignments").upsert(
        { user_id: currentUser.id, day_of_week: split.day, template_id: template.id },
        { onConflict: "user_id,day_of_week" }
      );
    }

    navigate("/today");
  };

  const dots = (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "14px 0 4px" }}>
      {STEPS.map((_, i) => (
        <span key={i} style={{ width: 22, height: 4, borderRadius: 99, background: i <= step ? "var(--primary)" : "var(--surface-2)" }} />
      ))}
    </div>
  );

  const current = STEPS[step];

  return (
    <div className="content" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100%" }}>
      {current === "welcome" && (
        <>
          <h1 className="pageTitle" style={{ textAlign: "center", fontSize: 28 }}>Get leaner. Get stronger.<br />Stop guessing.</h1>
          <p className="muted" style={{ textAlign: "center", margin: "12px 0 20px" }}>EZfit builds your plan, tracks your execution, and tells you when something actually needs to change.</p>
          {!user && (
            <>
              <div className="field"><label>Name</label><input value={form.display_name} onChange={(e) => set("display_name", e.target.value)} /></div>
              <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
              <div className="field"><label>Password</label><input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} /></div>
            </>
          )}
          <button className="btnPrimary" onClick={next}>Build my plan</button>
        </>
      )}

      {current === "goal" && (
        <>
          <h1 className="pageTitle">What's your goal?</h1>
          {[
            ["lose_fat", "Lose fat", "Reduce body fat, preserve muscle"],
            ["build_muscle", "Build muscle", "Add size and strength in a surplus"],
            ["recomp", "Body recomposition", "Lose fat while maintaining or gaining muscle"],
            ["maintain", "Maintain", "Hold current weight and strength"],
          ].map(([val, label, desc]) => (
            <div key={val} className="card cardTight" style={{ cursor: "pointer", borderColor: form.goal === val ? "var(--primary)" : "var(--border)", background: form.goal === val ? "var(--primary-tint)" : "var(--surface)" }} onClick={() => set("goal", val)}>
              <div style={{ fontWeight: 600 }}>{label}</div>
              <div className="muted" style={{ fontSize: 12 }}>{desc}</div>
            </div>
          ))}
          <button className="btnPrimary" onClick={next}>Continue</button>
        </>
      )}

      {current === "body" && (
        <>
          <h1 className="pageTitle">Your body profile</h1>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Sex</label>
              <select value={form.sex} onChange={(e) => set("sex", e.target.value)}><option value="male">Male</option><option value="female">Female</option></select>
            </div>
            <div className="field" style={{ flex: 1 }}><label>Age</label><input value={form.age_years} onChange={(e) => set("age_years", e.target.value)} /></div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Height (in)</label><input value={form.height_in} onChange={(e) => set("height_in", e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>Weight (lb)</label><input value={form.weight_lb} onChange={(e) => set("weight_lb", e.target.value)} /></div>
          </div>
          <div className="field"><label>Waist (in)</label><input value={form.waist_in} onChange={(e) => set("waist_in", e.target.value)} /></div>
          <button className="btnPrimary" onClick={next}>Continue</button>
        </>
      )}

      {current === "training" && (
        <>
          <h1 className="pageTitle">How many days can you realistically train?</h1>
          {[2, 3, 4, 5].map((n) => (
            <div key={n} className="card cardTight" style={{ cursor: "pointer", borderColor: form.training_days_per_week === n ? "var(--primary)" : "var(--border)", background: form.training_days_per_week === n ? "var(--primary-tint)" : "var(--surface)" }} onClick={() => set("training_days_per_week", n)}>
              <div style={{ fontWeight: 600 }}>{n} days / week</div>
              {n === 3 && <div className="muted" style={{ fontSize: 12 }}>Maximum focus. Enough volume. Plenty of recovery.</div>}
            </div>
          ))}
          <button className="btnPrimary" onClick={next}>Continue</button>
        </>
      )}

      {current === "nutrition" && (
        <>
          <h1 className="pageTitle">Nutrition targets</h1>
          <p className="muted">EZfit will recommend adjustments only when your progress data supports them.</p>
          <div className="field"><label>Calories</label><input value={form.calories} onChange={(e) => set("calories", e.target.value)} /></div>
          <div className="field"><label>Protein (g)</label><input value={form.protein_g} onChange={(e) => set("protein_g", e.target.value)} /></div>
          <div className="field"><label>Carbs (g)</label><input value={form.carbs_g} onChange={(e) => set("carbs_g", e.target.value)} /></div>
          <div className="field"><label>Fat (g)</label><input value={form.fat_g} onChange={(e) => set("fat_g", e.target.value)} /></div>
          <button className="btnPrimary" onClick={next}>Continue</button>
        </>
      )}

      {current === "calibration" && (
        <>
          <h1 className="pageTitle" style={{ textAlign: "center" }}>Let's learn your baseline.</h1>
          <p className="muted" style={{ textAlign: "center", margin: "10px 0 20px" }}>EZfit uses your actual results over 7–14 days rather than a generic calorie equation.</p>
          <button className="btnPrimary" onClick={finish}>Start EZfit</button>
        </>
      )}

      {dots}
    </div>
  );
}
