import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

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
      <button onClick={() => navigate("/train")} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 10 }}>&larr; Back</button>
      <h1 className="pageTitle" style={{ fontSize: 22 }}>Log cardio</h1>
      <p className="muted">This adds to today's calorie budget — burn 300, your target goes up by 300.</p>
      <div className="field"><label>Activity</label><input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Run, bike, rower…" /></div>
      <div className="field"><label>Duration (minutes)</label><input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Optional" /></div>
      <div className="field"><label>Calories burned</label><input value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="e.g. 300" /></div>
      <button className="btnPrimary" onClick={submit} disabled={!activity || !calories}>Add to today</button>
    </div>
  );
}
