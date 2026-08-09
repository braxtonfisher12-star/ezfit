import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../components/Card";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth";
import { useProfile } from "../../hooks/useProfile";
import { generateProgram } from "../../lib/programGenerator";

const STEPS = ["goal", "experience", "frequency", "equipment", "priorities", "preview"];
const MUSCLES = ["chest", "back", "shoulders", "arms", "legs", "glutes", "core"];

export default function ProgramBuilder() {
  const { user } = useAuth();
  const { saveProfile } = useProfile();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [library, setLibrary] = useState([]);
  const [form, setForm] = useState({ goal: "recomp", experience: "intermediate", daysPerWeek: 3, equipment: "full_gym", priorities: [] });
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("exercises").select("*").or(`is_global.eq.true,user_id.eq.${user.id}`);
      setLibrary(data ?? []);
    })();
  }, [user]);

  const togglePriority = (m) => {
    if (form.priorities.includes(m)) return setForm({ ...form, priorities: form.priorities.filter((p) => p !== m) });
    if (form.priorities.length >= 3) return;
    setForm({ ...form, priorities: [...form.priorities, m] });
  };

  const next = () => {
    if (STEPS[step] === "priorities") {
      const generated = generateProgram({ daysPerWeek: form.daysPerWeek, equipment: form.equipment, priorities: form.priorities, experience: form.experience }, library);
      setPreview(generated);
    }
    setStep(Math.min(STEPS.length - 1, step + 1));
  };

  const startProgram = async () => {
    setSaving(true);
    await saveProfile({ training_experience: form.experience, equipment: form.equipment, training_priorities: form.priorities, goal: form.goal });

    await supabase.from("workout_day_assignments").delete().eq("user_id", user.id);

    const splitName = preview.splitName;
    const { data: split } = await supabase.from("training_splits").insert({ user_id: user.id, name: splitName, source: "coach_generated" }).select().single();
    await supabase.from("training_splits").update({ is_active: false }).eq("user_id", user.id).neq("id", split.id);
    await supabase.from("training_blocks").update({ is_active: false }).eq("user_id", user.id);
    await supabase.from("training_blocks").insert({ user_id: user.id, split_id: split.id, name: splitName, start_date: new Date().toISOString().slice(0, 10), length_weeks: preview.blockLengthWeeks ?? 9 });

    const dayOfWeekForIndex = (i) => {
      const patterns = { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
      return (patterns[form.daysPerWeek] || patterns[3])[i];
    };

    for (let i = 0; i < preview.days.length; i++) {
      const day = preview.days[i];
      const { data: template } = await supabase.from("workout_templates").insert({ user_id: user.id, name: day.label }).select().single();
      await supabase.from("workout_template_exercises").insert(
        day.exercises.map((e, idx) => ({
          template_id: template.id,
          exercise_id: e.exercise.id,
          order_index: idx,
          target_sets: e.target_sets,
          target_reps_low: e.target_reps_low,
          target_reps_high: e.target_reps_high,
          rest_seconds: e.rest_seconds,
        }))
      );
      await supabase.from("workout_day_assignments").upsert(
        { user_id: user.id, day_of_week: dayOfWeekForIndex(i), template_id: template.id, split_id: split.id },
        { onConflict: "user_id,day_of_week" }
      );
    }
    setSaving(false);
    navigate("/train");
  };

  const current = STEPS[step];

  return (
    <div className="content">
      {current === "goal" && (
        <>
          <h1 className="pageTitle" style={{ fontSize: 22 }}>What are you training for?</h1>
          {[["recomp", "Body Recomposition", "Lose fat while building or maintaining muscle."], ["build_muscle", "Build Muscle", "Prioritize muscle and strength gain."], ["lose_fat", "Lose Fat", "Prioritize fat loss while preserving muscle."], ["maintain", "Maintain", "Maintain current body composition and performance."]].map(([val, label, desc]) => (
            <div key={val} className="card cardTight" style={{ cursor: "pointer", borderColor: form.goal === val ? "var(--primary)" : "var(--border)", background: form.goal === val ? "var(--primary-tint)" : "var(--surface)" }} onClick={() => setForm({ ...form, goal: val })}>
              <div style={{ fontWeight: 600 }}>{label}</div><div className="muted" style={{ fontSize: 12 }}>{desc}</div>
            </div>
          ))}
          <button className="btnPrimary" onClick={next}>Continue</button>
        </>
      )}

      {current === "experience" && (
        <>
          <h1 className="pageTitle" style={{ fontSize: 22 }}>What's your training experience?</h1>
          {[["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]].map(([val, label]) => (
            <div key={val} className="card cardTight" style={{ cursor: "pointer", borderColor: form.experience === val ? "var(--primary)" : "var(--border)", background: form.experience === val ? "var(--primary-tint)" : "var(--surface)" }} onClick={() => setForm({ ...form, experience: val })}>
              <div style={{ fontWeight: 600 }}>{label}</div>
            </div>
          ))}
          <button className="btnPrimary" onClick={next}>Continue</button>
        </>
      )}

      {current === "frequency" && (
        <>
          <h1 className="pageTitle" style={{ fontSize: 22 }}>How often can you realistically train?</h1>
          {[2, 3, 4, 5].map((n) => (
            <div key={n} className="card cardTight" style={{ cursor: "pointer", borderColor: form.daysPerWeek === n ? "var(--primary)" : "var(--border)", background: form.daysPerWeek === n ? "var(--primary-tint)" : "var(--surface)" }} onClick={() => setForm({ ...form, daysPerWeek: n })}>
              <div style={{ fontWeight: 600 }}>{n} days {n === 3 && <span className="pill blue" style={{ marginLeft: 6 }}>Recommended</span>}</div>
            </div>
          ))}
          <button className="btnPrimary" onClick={next}>Continue</button>
        </>
      )}

      {current === "equipment" && (
        <>
          <h1 className="pageTitle" style={{ fontSize: 22 }}>Where do you train?</h1>
          {[["full_gym", "Full Gym"], ["home_gym", "Home Gym"], ["dumbbells_only", "Dumbbells Only"], ["custom", "Custom Equipment"]].map(([val, label]) => (
            <div key={val} className="card cardTight" style={{ cursor: "pointer", borderColor: form.equipment === val ? "var(--primary)" : "var(--border)", background: form.equipment === val ? "var(--primary-tint)" : "var(--surface)" }} onClick={() => setForm({ ...form, equipment: val })}>
              <div style={{ fontWeight: 600 }}>{label}</div>
            </div>
          ))}
          <button className="btnPrimary" onClick={next}>Continue</button>
        </>
      )}

      {current === "priorities" && (
        <>
          <h1 className="pageTitle" style={{ fontSize: 22 }}>What do you want to prioritize?</h1>
          <p className="muted">Pick up to three.</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
            {MUSCLES.map((m) => (
              <button key={m} onClick={() => togglePriority(m)} style={{ padding: "8px 14px", borderRadius: 10, border: form.priorities.includes(m) ? "1.5px solid var(--primary)" : "1px solid var(--border)", background: form.priorities.includes(m) ? "var(--primary-tint)" : "var(--surface)", cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>
                {m}
              </button>
            ))}
          </div>
          <button className="btnPrimary" onClick={next}>Build my program</button>
        </>
      )}

      {current === "preview" && preview && (
        <>
          <div className="eyebrow">Your EZfit program</div>
          <h1 className="pageTitle" style={{ fontSize: 22 }}>{preview.splitName}</h1>
          <p className="muted">{preview.daysPerWeek} days/week · Training block: {preview.blockLengthWeeks} weeks</p>

          {preview.days.map((day, i) => (
            <Card key={i}>
              <div className="row" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontFamily: "var(--font-display)", fontSize: 15 }}>{day.label}</div>
                <span className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{day.exercises.length} exercises</span>
              </div>
              {day.exercises.map((e, j) => (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: "var(--surface-2)", borderRadius: 10, marginBottom: j < day.exercises.length - 1 ? 6 : 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{e.exercise.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-muted)", background: "var(--surface)", padding: "3px 8px", borderRadius: 6 }}>{e.target_sets} × {e.target_reps_low}–{e.target_reps_high}</span>
                </div>
              ))}
            </Card>
          ))}

          <Card>
            <div className="eyebrow">Why this program?</div>
            {preview.reasons.map((r, i) => (
              <div key={i} style={{ marginTop: i === 0 ? 6 : 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>{r.title}</div>
                <div className="muted" style={{ fontSize: 13 }}>{r.body}</div>
              </div>
            ))}
          </Card>

          <button className="btnPrimary" disabled={saving} onClick={startProgram}>{saving ? "Saving…" : "Start this program"}</button>
          <button className="btnGhost" style={{ marginTop: 8 }} onClick={() => navigate("/train/builder")}>Customize manually instead</button>
        </>
      )}
    </div>
  );
}
