import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import AvatarLink from "../components/AvatarLink";
import { Card, Pill } from "../components/Card";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { useWeekFood } from "../hooks/useWeekFood";
import { useProfile } from "../hooks/useProfile";
import { getWeekDates, toISODate, dayLabel } from "../lib/dateUtils";
import { pct } from "../lib/nutritionMath";

export default function Progress() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { targets } = useProfile();
  const { week, totalsForDate, loading: foodLoading } = useWeekFood();
  const [metrics, setMetrics] = useState([]);
  const [latestReview, setLatestReview] = useState(null);
  const [habitStats, setHabitStats] = useState({ weighIns7d: 0, weighIns30d: 0, foodLogDays30d: 0 });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: m } = await supabase
        .from("body_metrics")
        .select("*")
        .eq("user_id", user.id)
        .order("metric_date", { ascending: true })
        .limit(60);
      setMetrics(m ?? []);

      const { data: review } = await supabase
        .from("weekly_reviews")
        .select("*")
        .eq("user_id", user.id)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatestReview(review);

      const today = new Date();
      const d7 = new Date(today); d7.setDate(d7.getDate() - 7);
      const d30 = new Date(today); d30.setDate(d30.getDate() - 30);

      const [{ data: w7 }, { data: w30 }, { data: mealDays }] = await Promise.all([
        supabase.from("body_metrics").select("metric_date").eq("user_id", user.id).not("weight_lb", "is", null).gte("metric_date", toISODate(d7)),
        supabase.from("body_metrics").select("metric_date").eq("user_id", user.id).not("weight_lb", "is", null).gte("metric_date", toISODate(d30)),
        supabase.from("meals").select("meal_date").eq("user_id", user.id).gte("meal_date", toISODate(d30)),
      ]);
      setHabitStats({
        weighIns7d: (w7 ?? []).length,
        weighIns30d: (w30 ?? []).length,
        foodLogDays30d: new Set((mealDays ?? []).map((m) => m.meal_date)).size,
      });
    })();
  }, [user]);

  const first = metrics.find((m) => m.weight_lb);
  const last = [...metrics].reverse().find((m) => m.weight_lb);
  const weightChange = first && last ? (last.weight_lb - first.weight_lb).toFixed(1) : null;
  const points = metrics.filter((m) => m.weight_lb).map((m) => m.weight_lb);
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 1);
  const path = points
    .map((v, i) => {
      const x = (i / Math.max(1, points.length - 1)) * 300;
      const y = 50 - ((v - min) / Math.max(1, max - min)) * 45;
      return `${x},${y}`;
    })
    .join(" ");

  const calTarget = targets?.calories ?? 2200;

  return (
    <>
      <div className="content">
        <div className="row"><h1 className="pageTitle">Progress</h1><AvatarLink /></div>
        <p className="muted">Is the plan actually working?</p>

        {/* 7-day nutrition strip, MacroFactor-style */}
        <Card>
          <div className="eyebrow">This week's nutrition</div>
          {foodLoading ? (
            <div className="muted">Loading…</div>
          ) : (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {week.map((d) => {
                const iso = toISODate(d);
                const totals = totalsForDate(iso);
                const p = pct(totals.calories, calTarget);
                const isFuture = d > new Date();
                return (
                  <div key={iso} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-faint)" }}>{dayLabel(d)}</div>
                    <div style={{ height: 60, display: "flex", alignItems: "flex-end", justifyContent: "center", marginTop: 4 }}>
                      <div style={{ width: 14, height: `${isFuture ? 0 : Math.max(4, p * 0.6)}px`, background: p > 110 ? "var(--warning)" : "var(--primary)", borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{totals.calories ? Math.round(totals.calories) : "—"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Weight trend */}
        <Card>
          <div className="row"><span className="eyebrow" style={{ margin: 0 }}>Body weight</span>{weightChange && <Pill tone={weightChange < 0 ? "green" : "amber"}>{weightChange > 0 ? "+" : ""}{weightChange} lb</Pill>}</div>
          {last?.weight_lb && (
            <div className="row" style={{ alignItems: "baseline", marginTop: 4 }}>
              <span className="bigNum" style={{ fontSize: 22 }}>{last.weight_lb} lb</span>
              {first?.weight_lb && <span className="muted">from {first.weight_lb}</span>}
            </div>
          )}
          {points.length > 1 && (
            <svg viewBox="0 0 300 55" width="100%" height="50" style={{ marginTop: 6 }}>
              <polyline points={path} fill="none" stroke="var(--primary)" strokeWidth="2" />
            </svg>
          )}
        </Card>

        {/* Habits / consistency */}
        <Card>
          <div className="eyebrow">Habits</div>
          <div className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span className="muted">Weigh-ins, last 7 days</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{habitStats.weighIns7d} / 7</span>
          </div>
          <div className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span className="muted">Weigh-ins, last 30 days</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{habitStats.weighIns30d} / 30</span>
          </div>
          <div className="row" style={{ padding: "8px 0" }}>
            <span className="muted">Food logged, last 30 days</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{habitStats.foodLogDays30d} / 30 days</span>
          </div>
        </Card>

        {latestReview ? (
          <Card style={{ background: latestReview.decision_state === "green" ? "var(--success-tint)" : latestReview.decision_state === "orange" ? "var(--warning-tint)" : "var(--primary-tint)" }}>
            <Pill tone={latestReview.decision_state === "green" ? "green" : latestReview.decision_state === "orange" ? "amber" : "blue"}>
              {latestReview.decision_state} — week of {latestReview.week_start}
            </Pill>
            <div style={{ fontWeight: 600, marginTop: 8 }}>{latestReview.recommendation_text}</div>
          </Card>
        ) : (
          <Card><div className="muted">No weekly review yet — one generates automatically after your first full week of data.</div></Card>
        )}

        <Card tight onClick={() => navigate("/progress/photos")} style={{ cursor: "pointer" }}>
          <div className="row"><span style={{ fontWeight: 600, fontSize: 13.5 }}>📷 Progress photos</span><span className="muted">→</span></div>
        </Card>
      </div>
      <BottomNav />
    </>
  );
}
