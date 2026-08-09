import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Pill } from "../components/Card";
import Sparkline from "../components/Sparkline";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { estimatedOneRepMax } from "../lib/oneRepMax";

const DAYS = [[0, "Sun"], [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"]];

export default function WorkoutLibrary() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [exercisesByTemplate, setExercisesByTemplate] = useState({});
  const [sparklines, setSparklines] = useState({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from("workout_templates").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("workout_day_assignments").select("*").eq("user_id", user.id),
    ]);
    setTemplates(t ?? []);
    const map = {};
    for (const row of a ?? []) {
      map[row.template_id] = map[row.template_id] || [];
      map[row.template_id].push(row.day_of_week);
    }
    setAssignments(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const toggleExpand = async (templateId) => {
    if (expanded === templateId) return setExpanded(null);
    setExpanded(templateId);
    if (!exercisesByTemplate[templateId]) {
      const { data } = await supabase.from("workout_template_exercises").select("*, exercise:exercises(name)").eq("template_id", templateId).order("order_index");
      setExercisesByTemplate((prev) => ({ ...prev, [templateId]: data ?? [] }));

      for (const row of data ?? []) {
        if (sparklines[row.exercise_id]) continue;
        const { data: sets } = await supabase
          .from("sets")
          .select("actual_weight, actual_reps, completed_at")
          .eq("user_id", user.id)
          .eq("exercise_id", row.exercise_id)
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: true })
          .limit(30);
        const byDay = {};
        for (const s of sets ?? []) {
          const day = s.completed_at.slice(0, 10);
          const oneRM = estimatedOneRepMax(s.actual_weight, s.actual_reps);
          if (!byDay[day] || oneRM > byDay[day]) byDay[day] = oneRM;
        }
        const trend = Object.values(byDay).slice(-8);
        setSparklines((prev) => ({ ...prev, [row.exercise_id]: trend }));
      }
    }
  };

  const assignToDay = async (templateId, dayOfWeek) => {
    const { error } = await supabase.from("workout_day_assignments").upsert(
      { user_id: user.id, day_of_week: dayOfWeek, template_id: templateId },
      { onConflict: "user_id,day_of_week" }
    );
    if (error) return alert(`Couldn't assign: ${error.message}`);
    load();
  };

  const deleteTemplate = async (templateId) => {
    if (!confirm("Delete this workout? This can't be undone.")) return;
    const { error } = await supabase.from("workout_templates").delete().eq("id", templateId);
    if (error) return alert(`Couldn't delete: ${error.message}`);
    load();
  };

  if (loading) return <div className="content">Loading…</div>;

  return (
    <div className="content">
      <button onClick={() => navigate("/train")} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 10 }}>&larr; Back</button>
      <div className="row">
        <h1 className="pageTitle" style={{ fontSize: 22 }}>My workouts</h1>
        <button className="btnGhost" style={{ width: "auto", padding: "8px 14px", fontSize: 12.5 }} onClick={() => navigate("/train/builder")}>+ New</button>
      </div>

      {templates.length === 0 && (
        <Card><div className="muted">No workouts built yet.</div></Card>
      )}

      {templates.map((t) => {
        const assignedDays = assignments[t.id] ?? [];
        const isExpanded = expanded === t.id;
        return (
          <Card key={t.id}>
            <div className="row" style={{ cursor: "pointer" }} onClick={() => toggleExpand(t.id)}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {assignedDays.length > 0 ? assignedDays.map((d) => DAYS.find((x) => x[0] === d)[1]).join(", ") : "Not scheduled"}
                </div>
              </div>
              <span className="muted">{isExpanded ? "▲" : "▼"}</span>
            </div>

            {isExpanded && (
              <div style={{ marginTop: 12 }}>
                {(exercisesByTemplate[t.id] ?? []).map((e, i) => (
                  <div key={e.id} className="row" style={{ padding: "6px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none", fontSize: 13 }}>
                    <span onClick={() => navigate(`/train/exercise/${e.exercise_id}`)} style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--border)" }}>{e.exercise?.name}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Sparkline values={sparklines[e.exercise_id]} />
                      <span className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{e.target_sets} × {e.target_reps_low}–{e.target_reps_high}</span>
                    </div>
                  </div>
                ))}

                <div className="eyebrow" style={{ marginTop: 12 }}>Assign to a day</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {DAYS.map(([d, label]) => (
                    <button
                      key={d}
                      onClick={() => assignToDay(t.id, d)}
                      style={{ padding: "6px 10px", borderRadius: 8, border: assignedDays.includes(d) ? "1.5px solid var(--primary)" : "1px solid var(--border)", background: assignedDays.includes(d) ? "var(--primary-tint)" : "var(--surface)", cursor: "pointer", fontSize: 12 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button className="btnGhost" style={{ marginTop: 12, color: "var(--critical)" }} onClick={() => deleteTemplate(t.id)}>Delete workout</button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
