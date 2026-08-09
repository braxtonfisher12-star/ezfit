import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, Pill } from "../components/Card";
import { supabase } from "../lib/supabaseClient";

export default function TrainComplete() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const loggedSets = state?.loggedSets ?? [];
  const sessionId = state?.sessionId;
  const durationMinutes = state?.durationMinutes;
  const [notes, setNotes] = useState("");

  const byExercise = {};
  for (const s of loggedSets) {
    byExercise[s.exerciseName] = byExercise[s.exerciseName] || [];
    byExercise[s.exerciseName].push(s);
  }
  const prCount = loggedSets.filter((s) => s.isPr).length;

  const finish = async () => {
    if (notes && sessionId) {
      await supabase.from("workout_sessions").update({ notes }).eq("id", sessionId);
    }
    navigate("/today");
  };

  return (
    <div className="content">
      <div style={{ textAlign: "center", margin: "10px 0 6px" }}>
        <div className="eyebrow">Workout complete</div>
      </div>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
          {durationMinutes && <div><div className="bigNum" style={{ fontSize: 22 }}>{durationMinutes}</div><div className="muted" style={{ fontSize: 11 }}>minutes</div></div>}
          <div><div className="bigNum" style={{ fontSize: 22 }}>{Object.keys(byExercise).length}</div><div className="muted" style={{ fontSize: 11 }}>exercises</div></div>
          <div><div className="bigNum" style={{ fontSize: 22 }}>{loggedSets.length}</div><div className="muted" style={{ fontSize: 11 }}>working sets</div></div>
          <div><div className="bigNum" style={{ fontSize: 22 }}>{prCount}</div><div className="muted" style={{ fontSize: 11 }}>PRs</div></div>
        </div>
      </Card>
      {Object.entries(byExercise).map(([name, sets]) => (
        <Card tight key={name}>
          <div className="row"><span style={{ fontWeight: 600 }}>{name}</span>{sets.some((s) => s.isPr) && <Pill tone="green">PR</Pill>}</div>
          <div className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, marginTop: 4 }}>
            {sets.map((s) => `${s.weight}×${s.reps}`).join(" · ")}
          </div>
        </Card>
      ))}
      <Card>
        <div className="eyebrow">Notes</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Felt heavy today, shoulder a bit tight, etc. — optional."
          rows={3}
          style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontFamily: "var(--font-body)", fontSize: 13.5, resize: "vertical" }}
        />
      </Card>
      <button className="btnPrimary" onClick={finish}>Finish</button>
    </div>
  );
}
