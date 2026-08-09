import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, Pill } from "../components/Card";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { useProfile } from "../hooks/useProfile";
import { nextReversePyramidTarget, nextStraightSetTarget, isPR } from "../lib/progressionEngine";
import { applyDeload } from "../lib/oneRepMax";
import { randomQuote } from "../lib/quotes";
import { toDisplayWeight, fromDisplayWeight, unitLabel } from "../lib/units";

const SUPERSET_TRANSITION_REST = 15;

function buildSteps(templateExercises) {
  const steps = [];
  const seen = new Set();
  for (const te of templateExercises) {
    if (seen.has(te.id)) continue;
    if (te.superset_group == null) {
      for (let s = 1; s <= te.target_sets; s++) {
        steps.push({ te, setNumber: s, restAfter: te.rest_seconds, isSupersetRound: false });
      }
      seen.add(te.id);
    } else {
      const group = templateExercises.filter((t) => t.superset_group === te.superset_group);
      group.forEach((g) => seen.add(g.id));
      const maxSets = Math.max(...group.map((g) => g.target_sets));
      for (let round = 1; round <= maxSets; round++) {
        group.forEach((member, idx) => {
          if (round > member.target_sets) return;
          const isLastInRound = idx === group.length - 1;
          steps.push({ te: member, setNumber: round, restAfter: isLastInRound ? member.rest_seconds : SUPERSET_TRANSITION_REST, isSupersetRound: true });
        });
      }
    }
  }
  return steps;
}

export default function TrainActive() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { sessionId, templateId } = state ?? {};

  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [lastPerformance, setLastPerformance] = useState({});
  const [weightInput, setWeightInput] = useState("");
  const [repsInput, setRepsInput] = useState("");
  const [prResult, setPrResult] = useState(null);
  const [resting, setResting] = useState(false);
  const [restSeconds, setRestSeconds] = useState(0);
  const [quote, setQuote] = useState(randomQuote());
  const [loggedSets, setLoggedSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);
  const unit = profile?.weight_unit ?? "lb";

  useEffect(() => {
    if (!templateId) return;
    (async () => {
      const { data: rows } = await supabase
        .from("workout_template_exercises")
        .select("*, exercise:exercises(*)")
        .eq("template_id", templateId)
        .order("order_index");
      const built = buildSteps(rows ?? []);
      setSteps(built);

      const { data: sessionRow } = await supabase.from("workout_sessions").select("created_at").eq("id", sessionId).maybeSingle();
      if (sessionRow) setSessionStartedAt(sessionRow.created_at);

      const perf = {};
      for (const row of rows ?? []) {
        const { data: prevSet } = await supabase
          .from("sets")
          .select("*")
          .eq("user_id", user.id)
          .eq("exercise_id", row.exercise_id)
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prevSet) perf[row.exercise_id] = prevSet;
      }
      setLastPerformance(perf);
      setLoading(false);
    })();
  }, [templateId, user]);

  useEffect(() => {
    if (!resting || restSeconds <= 0) return;
    const t = setTimeout(() => setRestSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resting, restSeconds]);

  if (loading || steps.length === 0) return <div className="content">Loading workout…</div>;

  const step = steps[stepIndex];
  const exercise = step.te.exercise;
  const lastSet = lastPerformance[step.te.exercise_id];
  const isDeload = !!profile?.deload_week;

  let target =
    exercise.progression_method === "reverse_pyramid" && lastSet
      ? nextReversePyramidTarget({ lastWeight: lastSet.actual_weight, lastReps: lastSet.actual_reps, repRangeLow: step.te.target_reps_low, repRangeHigh: step.te.target_reps_high })
      : lastSet
      ? nextStraightSetTarget({ lastWeight: lastSet.actual_weight, setsReps: [lastSet.actual_reps], repRangeHigh: step.te.target_reps_high })
      : { targetWeight: null, targetRepsLow: step.te.target_reps_low, targetRepsHigh: step.te.target_reps_high, note: "First time logging this one — set your own baseline." };

  if (isDeload) target = applyDeload({ ...target, targetSets: step.te.target_sets }, true);

  const advance = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      finishWorkout();
    }
    setWeightInput("");
    setRepsInput("");
  };

  const completeSet = async () => {
    const weight = fromDisplayWeight(weightInput, unit);
    const reps = Number(repsInput);
    const pr = lastSet ? isPR({ weight, reps, prevWeight: lastSet.actual_weight, prevReps: lastSet.actual_reps }) : false;

    await supabase.from("sets").insert({
      session_id: sessionId,
      user_id: user.id,
      exercise_id: step.te.exercise_id,
      set_number: step.setNumber,
      target_weight: target.targetWeight,
      target_reps_low: target.targetRepsLow,
      target_reps_high: target.targetRepsHigh,
      actual_weight: weight,
      actual_reps: reps,
      is_pr: pr,
      completed_at: new Date().toISOString(),
    });

    setLoggedSets([...loggedSets, { exerciseName: exercise.name, weight, reps, isPr: pr }]);
    setLastPerformance({ ...lastPerformance, [step.te.exercise_id]: { actual_weight: weight, actual_reps: reps } });

    if (pr) {
      setPrResult({ weight, reps, prevWeight: lastSet.actual_weight, prevReps: lastSet.actual_reps, exerciseName: exercise.name });
    } else {
      startRest();
    }
  };

  const startRest = () => {
    setQuote(randomQuote());
    setResting(true);
    setRestSeconds(step.restAfter ?? 120);
  };

  const finishWorkout = async () => {
    const durationMinutes = sessionStartedAt ? Math.max(1, Math.round((Date.now() - new Date(sessionStartedAt)) / 60000)) : null;
    await supabase.from("workout_sessions").update({ status: "complete", duration_minutes: durationMinutes }).eq("id", sessionId);
    navigate("/train/complete", { state: { loggedSets, sessionId, durationMinutes } });
  };

  if (prResult) {
    return (
      <div className="content" style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", textAlign: "center" }}>
        <Pill tone="blue">New rep PR</Pill>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 19, marginTop: 14 }}>{prResult.exerciseName}</div>
        <div className="bigNum" style={{ fontSize: 46, margin: "10px 0" }}>{prResult.weight} × {prResult.reps}</div>
        <div className="muted">Previous {prResult.prevWeight} × {prResult.prevReps}</div>
        <button className="btnPrimary" style={{ marginTop: 30 }} onClick={() => { setPrResult(null); startRest(); }}>Continue</button>
      </div>
    );
  }

  if (resting) {
    return (
      <div className="content" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", textAlign: "center" }}>
        <div className="eyebrow">{step.isSupersetRound && step.restAfter === SUPERSET_TRANSITION_REST ? "Switch exercises" : "Recover"}</div>
        <div className="bigNum" style={{ fontSize: 64, margin: "6px 0 20px" }}>{Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, "0")}</div>
        {restSeconds > 30 && (
          <Card style={{ maxWidth: 280 }}>
            <div className="muted" style={{ fontStyle: "italic", fontSize: 13.5, lineHeight: 1.5 }}>"{quote}"</div>
          </Card>
        )}
        <div className="btnRow" style={{ width: "100%", maxWidth: 280, marginTop: 14 }}>
          <button className="btnGhost" onClick={() => setResting(false)}>Skip rest</button>
          <button className="btnGhost" onClick={() => setRestSeconds((s) => s + 30)}>+30 sec</button>
        </div>
        <button className="btnPrimary" style={{ marginTop: 10, maxWidth: 280 }} onClick={() => { setResting(false); advance(); }}>
          Ready — next set
        </button>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="row">
        <div className="eyebrow">Set {stepIndex + 1} of {steps.length}</div>
        {isDeload && <Pill tone="amber">Deload week</Pill>}
      </div>
      <h1 className="pageTitle" style={{ fontSize: 20 }}>{exercise.name}</h1>
      {lastSet && (
        <Card>
          <div className="eyebrow">Previous</div>
          <div className="muted" style={{ fontFamily: "var(--font-mono)" }}>{toDisplayWeight(lastSet.actual_weight, unit)} {unitLabel(unit)} × {lastSet.actual_reps}</div>
        </Card>
      )}
      <Card style={{ background: "var(--primary-tint)", borderColor: "var(--primary)" }}>
        <div className="eyebrow" style={{ color: "var(--primary)" }}>Beat this</div>
        <div style={{ fontFamily: "var(--font-mono)", color: "var(--primary-ink)", fontWeight: 700 }}>
          {target.targetWeight ? `${toDisplayWeight(target.targetWeight, unit)} ${unitLabel(unit)} × ${target.targetRepsLow}` : `${target.targetRepsLow}–${target.targetRepsHigh} reps`}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{target.note}</div>
      </Card>
      <Card>
        <div style={{ display: "flex", gap: 10 }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>Weight ({unitLabel(unit)})</label><input value={weightInput} onChange={(e) => setWeightInput(e.target.value)} placeholder={target.targetWeight ? String(toDisplayWeight(target.targetWeight, unit)) : ""} /></div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>Reps</label><input value={repsInput} onChange={(e) => setRepsInput(e.target.value)} /></div>
        </div>
      </Card>
      <button className="btnPrimary" onClick={completeSet} disabled={!weightInput || !repsInput}>Complete set</button>
    </div>
  );
}
