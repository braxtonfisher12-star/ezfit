import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Pill } from "../components/Card";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { estimatedOneRepMax } from "../lib/oneRepMax";

export default function ExerciseHistory() {
  const { exerciseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exercise, setExercise] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: ex }, { data: sets }] = await Promise.all([
        supabase.from("exercises").select("*").eq("id", exerciseId).single(),
        supabase.from("sets").select("*, workout_sessions(session_date)").eq("user_id", user.id).eq("exercise_id", exerciseId).order("completed_at"),
      ]);
      setExercise(ex);

      const byDate = {};
      for (const s of sets ?? []) {
        const date = s.workout_sessions?.session_date ?? s.completed_at?.slice(0, 10);
        const oneRM = estimatedOneRepMax(s.actual_weight, s.actual_reps);
        if (!byDate[date] || oneRM > byDate[date].oneRM) {
          byDate[date] = { date, weight: s.actual_weight, reps: s.actual_reps, oneRM, isPr: s.is_pr };
        }
      }
      setSessions(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)));
      setLoading(false);
    })();
  }, [exerciseId, user]);

  if (loading) return <div className="content">Loading…</div>;

  const points = sessions.map((s) => s.oneRM);
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 1);
  const path = points
    .map((v, i) => {
      const x = (i / Math.max(1, points.length - 1)) * 300;
      const y = 60 - ((v - min) / Math.max(1, max - min)) * 52;
      return `${x},${y}`;
    })
    .join(" ");

  const latest = sessions[sessions.length - 1];
  const first = sessions[0];
  const change = latest && first ? latest.oneRM - first.oneRM : 0;

  return (
    <div className="content">
      <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 10 }}>&larr; Back</button>
      <h1 className="pageTitle" style={{ fontSize: 22 }}>{exercise?.name}</h1>

      {sessions.length === 0 ? (
        <Card><div className="muted">No completed sets logged for this exercise yet.</div></Card>
      ) : (
        <>
          <Card>
            <div style={{ display: "flex", gap: 24 }}>
              <div>
                <div className="eyebrow">Current best</div>
                <div className="bigNum" style={{ fontSize: 22 }}>{latest.weight} × {latest.reps}</div>
              </div>
              <div>
                <div className="eyebrow">Est. 1RM change</div>
                <div className="bigNum" style={{ fontSize: 22, color: change >= 0 ? "var(--success)" : "var(--critical)" }}>{change >= 0 ? "+" : ""}{change} lb</div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="eyebrow">Estimated 1RM trend</div>
            <svg viewBox="0 0 300 65" width="100%" height="65" style={{ marginTop: 6 }}>
              <polyline points={path} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
            </svg>
            <div className="muted" style={{ fontSize: 11 }}>Epley estimate from your best set each session — not a lab measurement.</div>
          </Card>

          <div className="eyebrow">History</div>
          {[...sessions].reverse().map((s) => (
            <Card tight key={s.date}>
              <div className="row">
                <span style={{ fontFamily: "var(--font-mono)" }}>{s.date}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{s.weight} × {s.reps}</span>
                  {s.isPr && <Pill tone="green">PR</Pill>}
                </div>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}