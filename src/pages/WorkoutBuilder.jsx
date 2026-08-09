import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Pill } from "../components/Card";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

const DAYS = [
  [0, "Sunday"], [1, "Monday"], [2, "Tuesday"], [3, "Wednesday"],
  [4, "Thursday"], [5, "Friday"], [6, "Saturday"],
];

export default function WorkoutBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [exerciseLibrary, setExerciseLibrary] = useState([]);
  const [rows, setRows] = useState([]);
  const [assignedDays, setAssignedDays] = useState([]);
  const [customExerciseName, setCustomExerciseName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("exercises").select("*").or(`is_global.eq.true,user_id.eq.${user.id}`).order("name");
      setExerciseLibrary(data ?? []);
    })();
  }, [user]);

  const addRow = (exercise_id) => {
    setRows([...rows, { exercise_id, target_sets: 3, target_reps_low: 8, target_reps_high: 12, rest_seconds: 120, superset_group: null }]);
  };

  const togglePairWithPrevious = (i) => {
    if (i === 0) return;
    const next = [...rows];
    if (next[i].superset_group != null && next[i].superset_group === next[i - 1].superset_group) {
      next[i].superset_group = null;
    } else {
      const existingGroup = next[i - 1].superset_group ?? Math.max(0, ...next.map((r) => r.superset_group ?? 0)) + 1;
      next[i - 1].superset_group = existingGroup;
      next[i].superset_group = existingGroup;
    }
    setRows(next);
  };

  const addCustomExercise = async () => {
    if (!customExerciseName) return;
    const { data } = await supabase.from("exercises").insert({ user_id: user.id, name: customExerciseName, progression_method: "straight_set", rep_range_low: 8, rep_range_high: 12 }).select().single();
    setExerciseLibrary([...exerciseLibrary, data]);
    addRow(data.id);
    setCustomExerciseName("");
  };

  const updateRow = (i, field, value) => {
    const next = [...rows];
    next[i][field] = value;
    setRows(next);
  };

  const removeRow = (i) => {
    const removedGroup = rows[i].superset_group;
    let next = rows.filter((_, idx) => idx !== i);
    if (removedGroup != null) {
      const remainingInGroup = next.filter((r) => r.superset_group === removedGroup);
      if (remainingInGroup.length < 2) {
        next = next.map((r) => (r.superset_group === removedGroup ? { ...r, superset_group: null } : r));
      }
    }
    setRows(next);
  };

  const toggleDay = (d) => setAssignedDays(assignedDays.includes(d) ? assignedDays.filter((x) => x !== d) : [...assignedDays, d]);

  const save = async () => {
    if (!name || rows.length === 0) return alert("Give it a name and at least one exercise.");
    setSaving(true);

    const { data: template, error: templateError } = await supabase.from("workout_templates").insert({ user_id: user.id, name }).select().single();
    if (templateError || !template) {
      setSaving(false);
      alert(`Couldn't save the workout: ${templateError?.message ?? "unknown error"}`);
      console.error("workout_templates insert failed:", templateError);
      return;
    }

    const { error: exercisesError } = await supabase.from("workout_template_exercises").insert(
      rows.map((r, i) => ({
        template_id: template.id,
        exercise_id: r.exercise_id,
        order_index: i,
        target_sets: Number(r.target_sets),
        target_reps_low: Number(r.target_reps_low),
        target_reps_high: Number(r.target_reps_high),
        rest_seconds: Number(r.rest_seconds),
        superset_group: r.superset_group ?? null,
      }))
    );
    if (exercisesError) {
      setSaving(false);
      alert(`Workout was created but exercises failed to save: ${exercisesError.message}`);
      console.error("workout_template_exercises insert failed:", exercisesError);
      return;
    }

    for (const day of assignedDays) {
      const { error: assignError } = await supabase
        .from("workout_day_assignments")
        .upsert({ user_id: user.id, day_of_week: day, template_id: template.id }, { onConflict: "user_id,day_of_week" });
      if (assignError) {
        console.error("workout_day_assignments upsert failed:", assignError);
        alert(`Workout saved, but couldn't assign it to that day: ${assignError.message}`);
      }
    }

    setSaving(false);
    navigate("/train");
  };

  return (
    <div className="content">
      <button onClick={() => navigate("/train")} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 10 }}>&larr; Back</button>
      <h1 className="pageTitle" style={{ fontSize: 22 }}>Build a workout</h1>
      <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Upper A" /></div>

      <div className="eyebrow">Exercises</div>
      {rows.map((r, i) => {
        const ex = exerciseLibrary.find((e) => e.id === r.exercise_id);
        return (
          <Card tight key={i} style={r.superset_group != null ? { borderColor: "var(--primary)", background: "var(--primary-tint)" } : {}}>
            <div className="row" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>{ex?.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {r.superset_group != null && <Pill tone="blue">Superset</Pill>}
                <button
                  onClick={() => removeRow(i)}
                  aria-label="Remove exercise"
                  style={{ background: "none", border: "none", padding: 4, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24">
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="var(--critical)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
            {i > 0 && (
              <button
                onClick={() => togglePairWithPrevious(i)}
                style={{ background: "none", border: "none", color: "var(--primary)", fontSize: 11.5, cursor: "pointer", padding: 0, marginBottom: 8 }}
              >
                {r.superset_group != null && r.superset_group === rows[i - 1].superset_group ? "Unpair from previous exercise" : "🔗 Pair with previous exercise (no rest between)"}
              </button>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>SETS</label><input value={r.target_sets} onChange={(e) => updateRow(i, "target_sets", e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} /></div>
              <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>REPS LOW</label><input value={r.target_reps_low} onChange={(e) => updateRow(i, "target_reps_low", e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} /></div>
              <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>REPS HIGH</label><input value={r.target_reps_high} onChange={(e) => updateRow(i, "target_reps_high", e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} /></div>
            </div>
          </Card>
        );
      })}

      <div className="field">
        <label>Add from library</label>
        <select onChange={(e) => e.target.value && addRow(e.target.value)} value="">
          <option value="">Select an exercise…</option>
          {exerciseLibrary.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={customExerciseName} onChange={(e) => setCustomExerciseName(e.target.value)} placeholder="Or add a custom exercise" style={{ flex: 1, padding: 13, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
        <button className="btnGhost" style={{ width: "auto", padding: "0 16px" }} onClick={addCustomExercise}>Add</button>
      </div>

      <div className="eyebrow">Assign to days</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        {DAYS.map(([d, label]) => (
          <button
            key={d}
            onClick={() => toggleDay(d)}
            style={{ padding: "8px 12px", borderRadius: 10, border: assignedDays.includes(d) ? "1.5px solid var(--primary)" : "1px solid var(--border)", background: assignedDays.includes(d) ? "var(--primary-tint)" : "var(--surface)", cursor: "pointer", fontSize: 13 }}
          >
            {label.slice(0, 3)}
          </button>
        ))}
      </div>

      <button className="btnPrimary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save workout"}</button>
    </div>
  );
}
