import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Pill } from "../components/Card";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { estimatedOneRepMax } from "../lib/oneRepMax";

export default function BlockReview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [block, setBlock] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startingNext, setStartingNext] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: activeBlock } = await supabase.from("training_blocks").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      setBlock(activeBlock);
      if (!activeBlock) return setLoading(false);

      const { data: assignments } = await supabase
        .from("workout_day_assignments")
        .select("template_id")
        .eq("user_id", user.id)
        .eq("split_id", activeBlock.split_id);
      const templateIds = [...new Set((assignments ?? []).map((a) => a.template_id))];

      const { data: templateExercises } = await supabase
        .from("workout_template_exercises")
        .select("exercise_id, exercise:exercises(name)")
        .in("template_id", templateIds.length ? templateIds : ["00000000-0000-0000-0000-000000000000"]);
      const uniqueExercises = [...new Map((templateExercises ?? []).map((e) => [e.exercise_id, e])).values()];

      const rows = [];
      for (const ex of uniqueExercises) {
        const { data: sets } = await supabase
          .from("sets")
          .select("actual_weight, actual_reps, completed_at")
          .eq("user_id", user.id)
          .eq("exercise_id", ex.exercise_id)
          .gte("completed_at", activeBlock.start_date)
          .order("completed_at", { ascending: true });
        if (!sets || sets.length === 0) continue;

        const oneRMs = sets.map((s) => estimatedOneRepMax(s.actual_weight, s.actual_reps));
        const first = oneRMs[0];
        const last = oneRMs[oneRMs.length - 1];
        rows.push({ name: ex.exercise?.name, first, last, change: last - first, status: last > first ? "keep" : "review" });
      }
      setResults(rows);
      setLoading(false);
    })();
  }, [user]);

  const startNextBlock = async () => {
    setStartingNext(true);
    await supabase.from("training_blocks").update({ is_active: false }).eq("user_id", user.id);
    await supabase.from("training_blocks").insert({ user_id: user.id, split_id: block.split_id, name: block.name, start_date: new Date().toISOString().slice(0, 10), length_weeks: block.length_weeks });
    setStartingNext(false);
    navigate("/train");
  };

  if (loading) return <div className="content">Loading…</div>;
  if (!block) return <div className="content"><Card><div className="muted">No active training block. Build a split to start one.</div></Card></div>;

  return (
    <div className="content">
      <div className="eyebrow">Training block review</div>
      <h1 className="pageTitle" style={{ fontSize: 22 }}>{block.name}</h1>
      <p className="muted">{block.length_weeks} weeks · {results.length} exercises trained</p>

      {results.length === 0 && (
        <Card><div className="muted">No completed sets logged during this block yet.</div></Card>
      )}

      {results.map((r) => (
        <Card tight key={r.name}>
          <div className="row">
            <span style={{ fontWeight: 600 }}>{r.name}</span>
            <Pill tone={r.status === "keep" ? "green" : "amber"}>{r.status === "keep" ? "Keep" : "Review"}</Pill>
          </div>
          <div className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 4 }}>
            Est. 1RM {r.first} → {r.last} lb ({r.change >= 0 ? "+" : ""}{r.change})
          </div>
        </Card>
      ))}

      <button className="btnPrimary" onClick={startNextBlock} disabled={startingNext}>{startingNext ? "Starting…" : "Start next block"}</button>
      <button className="btnGhost" style={{ marginTop: 8 }} onClick={() => navigate("/train")}>Back to Train</button>
    </div>
  );
}
