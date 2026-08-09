import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../components/Card";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth";
import { useProfile } from "../../hooks/useProfile";
import { computeGoalProjection, estimateMaintenanceCalories, dailyCalorieAdjustmentForRate } from "../../lib/goalProjection";

const RATES = [0.5, 1, 1.5, 2];

export default function GoalSetup() {
  const { user } = useAuth();
  const { profile, saveProfile, saveTargets } = useProfile();
  const navigate = useNavigate();

  const [currentWeight, setCurrentWeight] = useState(180);
  const [targetWeight, setTargetWeight] = useState(170);
  const [rate, setRate] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("body_metrics").select("weight_lb").eq("user_id", user.id).not("weight_lb", "is", null).order("metric_date", { ascending: false }).limit(1).maybeSingle();
      if (data?.weight_lb) {
        setCurrentWeight(Math.round(data.weight_lb));
        setTargetWeight(Math.round(data.weight_lb - 10));
      }
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <div className="content">Loading…</div>;

  const isLoss = currentWeight > targetWeight;
  const projection = computeGoalProjection({ currentWeight, targetWeight, rateLbPerWeek: rate });

  const min = Math.min(...projection.points, targetWeight, currentWeight);
  const max = Math.max(...projection.points, targetWeight, currentWeight);
  const path = projection.points
    .map((v, i) => {
      const x = (i / Math.max(1, projection.points.length - 1)) * 280;
      const y = 70 - ((v - min) / Math.max(1, max - min)) * 60;
      return `${x},${y}`;
    })
    .join(" ");

  const confirm = async () => {
    setSaving(true);
    const maintenance = estimateMaintenanceCalories({ sex: profile?.sex, ageYears: profile?.age_years, heightIn: profile?.height_in, weightLb: currentWeight });
    const adjustment = dailyCalorieAdjustmentForRate(rate, isLoss);
    const calories = Math.max(1200, maintenance + adjustment);
    const protein_g = Math.round(targetWeight * 1);
    const proteinKcal = protein_g * 4;
    const remaining = Math.max(0, calories - proteinKcal);
    const carbs_g = Math.round((remaining * 0.55) / 4);
    const fat_g = Math.round((remaining * 0.45) / 9);

    await saveProfile({
      goal_weight_lb: targetWeight,
      goal_rate_lb_per_week: rate,
      goal_target_date: projection.targetDate.toISOString().slice(0, 10),
      goal_start_weight_lb: currentWeight,
      goal_start_date: new Date().toISOString().slice(0, 10),
      goal: isLoss ? "lose_fat" : "build_muscle",
    });
    await saveTargets({ calories, protein_g, carbs_g, fat_g, reason: `Coach-calculated from goal: ${currentWeight} → ${targetWeight} lb at ${rate} lb/week` });

    setSaving(false);
    navigate("/coach");
  };

  return (
    <div className="content">
      <button onClick={() => navigate("/coach")} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 10 }}>&larr; Back</button>
      <h1 className="pageTitle" style={{ fontSize: 22 }}>Set your weight goal</h1>
      <p className="muted">Pick where you're starting, where you want to end up, and how fast — Coach handles the calories and macros.</p>

      <Card>
        <div className="eyebrow">Current weight</div>
        <div className="bigNum" style={{ fontSize: 26 }}>{currentWeight} lb</div>
        <input type="range" min="100" max="350" value={currentWeight} onChange={(e) => setCurrentWeight(Number(e.target.value))} style={{ width: "100%", marginTop: 8 }} />
      </Card>

      <Card>
        <div className="eyebrow">Target weight</div>
        <div className="bigNum" style={{ fontSize: 26, color: "var(--primary)" }}>{targetWeight} lb</div>
        <input type="range" min="100" max="350" value={targetWeight} onChange={(e) => setTargetWeight(Number(e.target.value))} style={{ width: "100%", marginTop: 8 }} />
      </Card>

      <Card>
        <div className="eyebrow">Rate</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {RATES.map((r) => (
            <button
              key={r}
              onClick={() => setRate(r)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer", border: rate === r ? "1.5px solid var(--primary)" : "1px solid var(--border)", background: rate === r ? "var(--primary-tint)" : "var(--surface)", fontWeight: 600, fontSize: 13 }}
            >
              {r} lb/wk
            </button>
          ))}
        </div>
      </Card>

      <Card style={{ background: "var(--primary-tint)", borderColor: "var(--primary)" }}>
        <div className="eyebrow" style={{ color: "var(--primary)" }}>Projection</div>
        <div className="bigNum" style={{ fontSize: 20, color: "var(--primary-ink)" }}>{projection.weeksToGoal} weeks</div>
        <div className="muted" style={{ fontSize: 12.5 }}>Target date: {projection.targetDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</div>
        <svg viewBox="0 0 280 75" width="100%" height="75" style={{ marginTop: 10 }}>
          <polyline points={path} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
        </svg>
      </Card>

      <button className="btnPrimary" onClick={confirm} disabled={saving}>{saving ? "Calculating…" : "Let Coach decide the rest"}</button>
    </div>
  );
}
