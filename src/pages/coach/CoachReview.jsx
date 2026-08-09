import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Pill } from "../../components/Card";
import StateIcon from "../../components/StateIcon";
import StatTile from "../../components/StatTile";
import Sparkline from "../../components/Sparkline";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth";
import { useProfile } from "../../hooks/useProfile";
import { STATE_META, stateDirection } from "../../lib/coachStates";
import { recalcMacrosForCalorieChange } from "../../lib/macroRecalc";
import { computeGoalProjection } from "../../lib/goalProjection";
import { shareOrDownloadReviewImage } from "../../lib/shareReview";

// Full detail view of one weekly review — evidence tiles with sparklines
// (trend across recent weeks, not just this week's number), insights,
// progressive overload, and the accept/decline control for the recommended
// calorie change. Reached from Coach Home or the review history list.
export default function CoachReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { targets, saveTargets, profile } = useProfile();
  const [review, setReview] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: h }] = await Promise.all([
      supabase.from("weekly_reviews").select("*").eq("id", id).eq("user_id", user.id).single(),
      supabase.from("weekly_reviews").select("*").eq("user_id", user.id).order("week_start", { ascending: true }).limit(8),
    ]);
    setReview(r);
    setHistory(h ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id, user]);

  if (loading) return <div className="content">Loading…</div>;
  if (!review) return <div className="content"><Card><div className="muted">Review not found.</div></Card></div>;

  const meta = STATE_META[review.decision_state] ?? STATE_META.gray;
  const direction = stateDirection(review.decision_state);
  const isLatest = history.length > 0 && history[history.length - 1].id === review.id;
  const canAct = isLatest && review.user_response === "pending" && review.recommended_calorie_change !== 0;

  const weightSeries = history.map((h) => h.avg_weight_lb).filter((v) => v != null);
  const waistSeries = history.map((h) => h.avg_waist_in).filter((v) => v != null);
  const calorieAdherenceSeries = history.map((h) => h.calorie_adherence_pct).filter((v) => v != null);
  const trainingAdherenceSeries = history.map((h) => (h.workouts_scheduled ? Math.round((h.workouts_completed / h.workouts_scheduled) * 100) : null)).filter((v) => v != null);
  const overloadSeries = history.map((h) => h.progressive_overload_lb ?? 0);

  const accept = async () => {
    setActing(true);
    const newTargets = recalcMacrosForCalorieChange({
      currentCalories: targets?.calories ?? review.calorie_target ?? 2200,
      currentProtein: targets?.protein_g ?? 180,
      currentCarbs: targets?.carbs_g ?? 200,
      currentFat: targets?.fat_g ?? 70,
      calorieChange: review.recommended_calorie_change,
    });
    await saveTargets({ ...newTargets, reason: `Accepted Coach recommendation from week of ${review.week_start}` });
    await supabase.from("weekly_reviews").update({ user_response: "accepted" }).eq("id", review.id);
    setActing(false);
    load();
  };

  const decline = async () => {
    setActing(true);
    await supabase.from("weekly_reviews").update({ user_response: "declined" }).eq("id", review.id);
    setActing(false);
    load();
  };

  return (
    <div className="content">
      <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 10 }}>&larr; Back</button>

      <div style={{ background: meta.gradient, borderRadius: 18, padding: 18, color: "#fff", boxShadow: "0 8px 20px -8px rgba(0,0,0,0.25)", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StateIcon icon={meta.icon} color="#fff" size={22} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.9 }}>Week of {review.week_start}</span>
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, marginTop: 8 }}>{meta.label}</div>
        <div style={{ fontSize: 13.5, opacity: 0.95, marginTop: 4 }}>{review.recommendation_text}</div>
        {review.is_deload_week && <Pill tone="gray" style={{ marginTop: 10 }}>Deload week</Pill>}
        <button
          onClick={() => shareOrDownloadReviewImage(review, meta.label)}
          style={{ marginTop: 12, background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 10, padding: "8px 14px", color: "#fff", fontSize: 12.5, cursor: "pointer" }}
        >
          Share this review
        </button>
      </div>

      {review.progressive_overload_lb > 0 && (
        <Card style={{ background: "var(--success-tint)", borderColor: "var(--success)" }}>
          <div className="eyebrow" style={{ color: "var(--success)" }}>Progressive overload</div>
          <div className="bigNum" style={{ fontSize: 22, color: "var(--success)" }}>+{review.progressive_overload_lb} lb</div>
          <div className="muted" style={{ fontSize: 12 }}>across {review.exercises_improved} exercise{review.exercises_improved === 1 ? "" : "s"} this week</div>
        </Card>
      )}

      <div className="eyebrow" style={{ marginTop: 4 }}>Evidence</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <StatTile label="Weight" value={`${review.avg_weight_lb ?? "—"} lb`} values={weightSeries} color="var(--primary)" />
        <StatTile label="Waist" value={`${review.avg_waist_in ?? "—"} in`} values={waistSeries} color="var(--fat)" />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <StatTile label="Cal. adherence" value={`${review.calorie_adherence_pct ?? "—"}%`} values={calorieAdherenceSeries} color="var(--warning)" />
        <StatTile label="Training" value={`${review.workouts_completed}/${review.workouts_scheduled}`} values={trainingAdherenceSeries} color="var(--success)" />
      </div>
      <Card tight>
        <div className="eyebrow">Overload trend</div>
        <Sparkline values={overloadSeries} width={280} height={30} color="var(--success)" />
      </Card>

      {profile?.goal_weight_lb && review.avg_weight_lb && (
        <Card>
          <div className="eyebrow">Projected to goal</div>
          {(() => {
            const projection = computeGoalProjection({ currentWeight: review.avg_weight_lb, targetWeight: profile.goal_weight_lb, rateLbPerWeek: profile.goal_rate_lb_per_week ?? 1 });
            const actual = weightSeries;
            const combined = [...actual, ...projection.points.slice(1)];
            const min = Math.min(...combined);
            const max = Math.max(...combined);
            const toPath = (series, offset = 0) =>
              series.map((v, i) => {
                const x = ((i + offset) / Math.max(1, combined.length - 1)) * 280;
                const y = 60 - ((v - min) / Math.max(1, max - min)) * 52;
                return `${x},${y}`;
              }).join(" ");
            return (
              <>
                <svg viewBox="0 0 280 65" width="100%" height="65">
                  <polyline points={toPath(actual)} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
                  <polyline points={toPath(projection.points, actual.length - 1)} fill="none" stroke="var(--text-faint)" strokeWidth="2" strokeDasharray="5 4" />
                </svg>
                <div className="muted" style={{ fontSize: 11 }}>Solid = actual · dashed = projected to {profile.goal_weight_lb} lb by {new Date(profile.goal_target_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
              </>
            );
          })()}
        </Card>
      )}

      {review.insights?.length > 0 && (
        <Card>
          <div className="eyebrow">This week</div>
          {review.insights.map((ins, i) => (
            <div key={i} style={{ marginTop: i === 0 ? 4 : 10 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>{ins.label}</div>
              <div className="muted" style={{ fontSize: 13 }}>{ins.body}</div>
            </div>
          ))}
        </Card>
      )}

      {review.recommended_calorie_change !== 0 && (
        <Card style={{ borderColor: "var(--primary)" }}>
          <div className="eyebrow" style={{ color: "var(--primary)" }}>Recommended adjustment</div>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="bigNum" style={{ fontSize: 18 }}>{targets?.calories ?? review.calorie_target} kcal</span>
            <span style={{ fontSize: 18 }}>→</span>
            <span className="bigNum" style={{ fontSize: 18, color: direction === "increase" ? "var(--primary)" : "var(--fat)" }}>
              {(targets?.calories ?? review.calorie_target) + review.recommended_calorie_change} kcal
            </span>
          </div>
          {review.user_response === "accepted" && <Pill tone="green" style={{ marginTop: 10 }}>Accepted</Pill>}
          {review.user_response === "declined" && <Pill tone="gray" style={{ marginTop: 10 }}>Kept current plan</Pill>}
          {canAct && (
            <div className="btnRow" style={{ marginTop: 12 }}>
              <button className="btnGhost" onClick={decline} disabled={acting}>Keep current</button>
              <button className="btnPrimary" onClick={accept} disabled={acting}>{acting ? "…" : "Accept change"}</button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
