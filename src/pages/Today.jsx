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
import { toDisplayWeight, fromDisplayWeight, unitLabel } from "../lib/units";

export default function Today() {
  const { user } = useAuth();
  const { profile, targets } = useProfile();
  const { bodyMetric, recovery, macroTotals, todaysSession, cardioCalories, loading, reload } = useTodayData();
  const navigate = useNavigate();
  const [weightInput, setWeightInput] = useState("");
  const [waistInput, setWaistInput] = useState("");
  const [stepsInput, setStepsInput] = useState("");

  const logWeight = async () => {
    if (!weightInput) return;
    const today = new Date().toISOString().slice(0, 10);
    const weightLb = fromDisplayWeight(weightInput, profile?.weight_unit ?? "lb");
    await supabase.from("body_metrics").upsert({ user_id: user.id, metric_date: today, weight_lb: weightLb });
    setWeightInput("");
    reload();
  };

  const logWaist = async () => {
    if (!waistInput) return;
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("body_metrics").upsert({ user_id: user.id, metric_date: today, waist_in: Number(waistInput) });
    setWaistInput("");
    reload();
  };

  const logSteps = async () => {
    if (!stepsInput) return;
    const today = new Date().toISOString().slice(0, 10);
    const newTotal = (recovery?.steps ?? 0) + Number(stepsInput);
    await supabase.from("recovery_logs").upsert({ user_id: user.id, log_date: today, steps: newTotal });
    setStepsInput("");
    reload();
  };

  const addStepsQuick = async (amount) => {
    const today = new Date().toISOString().slice(0, 10);
    const newTotal = (recovery?.steps ?? 0) + amount;
    await supabase.from("recovery_logs").upsert({ user_id: user.id, log_date: today, steps: newTotal });
    reload();
  };

  if (loading) return <div className="content">Loading today…</div>;

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
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div className="eyebrow">Today's weight</div>
              {bodyMetric?.weight_lb ? (
                <div className="bigNum" style={{ fontSize: 24 }}>{toDisplayWeight(bodyMetric.weight_lb, profile?.weight_unit ?? "lb")} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>{unitLabel(profile?.weight_unit ?? "lb")}</span></div>
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input placeholder={unitLabel(profile?.weight_unit ?? "lb")} value={weightInput} onChange={(e) => setWeightInput(e.target.value)} style={{ width: 62, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
                  <button className="btnGhost" style={{ width: "auto", padding: "8px 10px" }} onClick={logWeight}>Log</button>
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div className="eyebrow">Waist</div>
              {bodyMetric?.waist_in ? (
                <div className="bigNum" style={{ fontSize: 24 }}>{bodyMetric.waist_in} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>in</span></div>
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input placeholder="in" value={waistInput} onChange={(e) => setWaistInput(e.target.value)} style={{ width: 62, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
                  <button className="btnGhost" style={{ width: "auto", padding: "8px 10px" }} onClick={logWaist}>Log</button>
                </div>
              )}
            </div>
          </div>
          <div className="divider" />
          <div style={{ flex: 1 }}>
              <div className="eyebrow">Sleep</div>
              <div className="bigNum" style={{ fontSize: 26 }}>
                {recovery?.sleep_minutes ? `${Math.floor(recovery.sleep_minutes / 60)}h ${recovery.sleep_minutes % 60}m` : "—"}
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
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {[500, 1000, 2500].map((amt) => (
              <button key={amt} className="btnGhost" style={{ flex: 1, padding: "8px 0", fontSize: 12 }} onClick={() => addStepsQuick(amt)}>+{amt}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input placeholder="Add steps" value={stepsInput} onChange={(e) => setStepsInput(e.target.value)} inputMode="numeric" style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
            <button className="btnGhost" style={{ width: "auto", padding: "8px 12px" }} onClick={logSteps}>Add</button>
          </div>
        </Card>

        <Card>
          <div className="eyebrow" style={{ margin: 0 }}>Today's score</div>
          <div className="bigNum" style={{ fontSize: 30 }}>{score}<span style={{ fontSize: 15, color: "var(--text-muted)", fontWeight: 500 }}>/100</span></div>
        </Card>

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
