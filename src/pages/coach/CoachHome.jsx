import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import BottomNav from "../../components/BottomNav";
import { Card, Pill } from "../../components/Card";
import RingProgress from "../../components/RingProgress";
import StateIcon from "../../components/StateIcon";
import StatTile from "../../components/StatTile";
import JourneyStrip from "../../components/JourneyStrip";
import ComplianceHeatmap from "../../components/ComplianceHeatmap";
import MilestoneCelebration from "../../components/MilestoneCelebration";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth";
import { useProfile } from "../../hooks/useProfile";
import { STATE_META } from "../../lib/coachStates";
import { runWeeklyReviewNow } from "../../lib/runWeeklyReview";
import { checkNewMilestones } from "../../lib/milestones";
import { showLocalNotification } from "../../lib/notifications";
import { toISODate } from "../../lib/dateUtils";
import { computePace } from "../../lib/paceCalc";

function longestStreak(dates) {
  if (!dates.length) return 0;
  const sorted = [...new Set(dates)].sort();
  let best = 1, current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const cur = new Date(sorted[i]);
    const diffDays = Math.round((cur - prev) / 86400000);
    if (diffDays === 1) { current++; best = Math.max(best, current); }
    else current = 1;
  }
  return best;
}

export default function CoachHome() {
  const { user } = useAuth();
  const { profile, targets } = useProfile();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState([]);
  const [activeSplit, setActiveSplit] = useState(null);
  const [review, setReview] = useState(null);
  const [history, setHistory] = useState([]);
  const [journey, setJourney] = useState(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [runningReview, setRunningReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [heatmapData, setHeatmapData] = useState(null);
  const [milestoneQueue, setMilestoneQueue] = useState([]);
  const [currentWeightLb, setCurrentWeightLb] = useState(null);

  const load = async () => {
    const { data: assignments } = await supabase.from("workout_day_assignments").select("*, workout_templates(name)").eq("user_id", user.id);
    setTemplates(assignments ?? []);

    const { data: split } = await supabase.from("training_splits").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setActiveSplit(split);

    const { data: latestReview } = await supabase.from("weekly_reviews").select("*").eq("user_id", user.id).order("week_start", { ascending: false }).limit(1).maybeSingle();
    setReview(latestReview);

    const { data: h } = await supabase.from("weekly_reviews").select("*").eq("user_id", user.id).order("week_start", { ascending: true }).limit(8);
    setHistory(h ?? []);

    const [{ data: allMetrics }, { data: completedSessions }, { data: allReviews }] = await Promise.all([
      supabase.from("body_metrics").select("weight_lb, metric_date").eq("user_id", user.id).not("weight_lb", "is", null).order("metric_date"),
      supabase.from("workout_sessions").select("session_date").eq("user_id", user.id).eq("status", "complete"),
      supabase.from("weekly_reviews").select("progressive_overload_lb"),
    ]);
    const first = allMetrics?.[0]?.weight_lb;
    const latest = allMetrics?.[allMetrics.length - 1]?.weight_lb;
    setCurrentWeightLb(latest ?? null);
    const weekSet = new Set((completedSessions ?? []).map((s) => {
      const d = new Date(s.session_date);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      return `${d.getFullYear()}-${Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)}`;
    }));
    setJourney({
      totalChangeLb: first && latest ? Math.round((latest - first) * 10) / 10 : 0,
      weeksTrained: weekSet.size,
      longestStreak: longestStreak((completedSessions ?? []).map((s) => s.session_date)),
      totalOverloadLb: Math.round((allReviews ?? []).reduce((sum, r) => sum + (r.progressive_overload_lb ?? 0), 0)),
    });

    const seventyDaysAgo = new Date();
    seventyDaysAgo.setDate(seventyDaysAgo.getDate() - 70);
    const seventyAgoISO = toISODate(seventyDaysAgo);
    const [{ data: weightRows }, { data: foodRows }, { data: stepRows }] = await Promise.all([
      supabase.from("body_metrics").select("metric_date").eq("user_id", user.id).not("weight_lb", "is", null).gte("metric_date", seventyAgoISO),
      supabase.from("meals").select("meal_date").eq("user_id", user.id).gte("meal_date", seventyAgoISO),
      supabase.from("recovery_logs").select("log_date").eq("user_id", user.id).not("steps", "is", null).gte("log_date", seventyAgoISO),
    ]);
    setHeatmapData({
      weightDates: new Set((weightRows ?? []).map((r) => r.metric_date)),
      foodDates: new Set((foodRows ?? []).map((r) => r.meal_date)),
      stepsDates: new Set((stepRows ?? []).map((r) => r.log_date)),
    });

    const journeyForMilestones = {
      totalChangeLb: first && latest ? Math.round((latest - first) * 10) / 10 : 0,
      weeksTrained: weekSet.size,
      longestStreak: longestStreak((completedSessions ?? []).map((s) => s.session_date)),
      totalOverloadLb: Math.round((allReviews ?? []).reduce((sum, r) => sum + (r.progressive_overload_lb ?? 0), 0)),
    };
    const { data: achieved } = await supabase.from("milestones_achieved").select("milestone_key").eq("user_id", user.id);
    const achievedKeys = (achieved ?? []).map((a) => a.milestone_key);
    const newMilestones = checkNewMilestones(journeyForMilestones, achievedKeys);
    if (newMilestones.length > 0) {
      await supabase.from("milestones_achieved").insert(newMilestones.map((m) => ({ user_id: user.id, milestone_key: m.key })));
      setMilestoneQueue(newMilestones);
    }

    if (latestReview && !latestReview.viewed_at) {
      const notifiedKey = `ezfit-notified-${latestReview.id}`;
      if (!localStorage.getItem(notifiedKey)) {
        showLocalNotification("Your EZfit weekly review is ready", { body: latestReview.recommendation_text || "Tap to see this week's verdict." });
        localStorage.setItem(notifiedKey, "1");
      }
    }

    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const nextReview = () => {
    const d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
    return d;
  };
  const daysUntilReview = Math.ceil((nextReview() - new Date()) / 86400000);

  const meta = review ? STATE_META[review.decision_state] ?? STATE_META.gray : null;
  const uniqueTemplates = [...new Map(templates.map((t) => [t.template_id, t])).values()];

  const pace = profile?.goal_weight_lb
    ? computePace({
        goalStartWeightLb: profile.goal_start_weight_lb,
        goalStartDate: profile.goal_start_date,
        goalWeightLb: profile.goal_weight_lb,
        goalRateLbPerWeek: profile.goal_rate_lb_per_week,
        currentWeightLb,
      })
    : null;

  const weightSeries = history.map((h) => h.avg_weight_lb).filter((v) => v != null);
  const waistSeries = history.map((h) => h.avg_waist_in).filter((v) => v != null);
  const calorieAdherenceSeries = history.map((h) => h.calorie_adherence_pct).filter((v) => v != null);
  const trainingAdherenceSeries = history.map((h) => (h.workouts_scheduled ? Math.round((h.workouts_completed / h.workouts_scheduled) * 100) : null)).filter((v) => v != null);

  const runReviewNow = async () => {
    setRunningReview(true);
    try {
      await runWeeklyReviewNow(user);
      await load();
    } catch (err) {
      console.error(err);
      alert("Couldn't run the review: " + err.message);
    }
    setRunningReview(false);
  };

  const askEZfit = async (q) => {
    if (!q) return;
    setAsking(true);
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    try {
      const res = await fetch("/.netlify/functions/coach-ask", {
        method: "POST",
        body: JSON.stringify({
          question: q,
          context: {
            profile: { goal: profile?.goal, deload_week: profile?.deload_week, goalWeight: profile?.goal_weight_lb, goalRate: profile?.goal_rate_lb_per_week },
            targets,
            latestReview: review,
            recentReviews: history.slice(-4).map((h) => ({ week: h.week_start, state: h.decision_state, overloadLb: h.progressive_overload_lb, workouts: `${h.workouts_completed}/${h.workouts_scheduled}`, sleepTrend: h.sleep_trend })),
            activeSplit: activeSplit?.name,
            journey,
          },
        }),
      });
      const json = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", text: json.answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "EZfit couldn't reach the Coach explainer right now." }]);
    }
    setAsking(false);
  };

  if (loading) return <div className="content">Loading…</div>;

  if (review && !review.viewed_at) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "linear-gradient(135deg, var(--primary) 0%, #4A63FF 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
        <div style={{ textAlign: "center", color: "#fff" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Week of {review.week_start}</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, marginTop: 6 }}>Your weekly review is ready</div>
          {review.progressive_overload_lb > 0 && <div style={{ opacity: 0.85, fontSize: 13, marginTop: 4 }}>🔥 +{review.progressive_overload_lb} lb overloaded this week</div>}
        </div>
        <button
          onClick={() => navigate(`/coach/story/${review.id}`)}
          style={{ width: 150, height: 150, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <div style={{ width: 118, height: 118, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary-ink)", fontWeight: 700, fontSize: 13, textAlign: "center", padding: 10 }}>
            Tap to view
          </div>
        </button>
        <button onClick={() => navigate("/today")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: "pointer" }}>Later</button>
      </div>
    );
  }

  return (
    <>
      <div className="content">
        <div className="row">
          <h1 className="pageTitle">EZfit Coach</h1>
          <Link to="/profile" style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--primary-tint)", color: "var(--primary-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "var(--font-display)", textDecoration: "none" }}>
            {(profile?.display_name || "?")[0]}
          </Link>
        </div>
        <div className="eyebrow">Current goal</div>
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, marginTop: 0 }}>
          {profile?.goal === "recomp" ? "Body Recomposition" : profile?.goal === "lose_fat" ? "Lose Fat" : profile?.goal === "build_muscle" ? "Build Muscle" : "Maintain"}
          {profile?.goal_weight_lb && <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}> · target {profile.goal_weight_lb} lb</span>}
        </p>

        {journey && <JourneyStrip {...journey} />}

        {heatmapData && (
          <Card>
            <div className="eyebrow">Consistency — last 10 weeks</div>
            <ComplianceHeatmap {...heatmapData} weeks={10} />
          </Card>
        )}

        <MilestoneCelebration
          milestone={milestoneQueue[0]}
          onDismiss={() => setMilestoneQueue((q) => q.slice(1))}
        />

        {profile?.deload_week && (
          <Card style={{ background: "var(--warning-tint)", borderColor: "var(--warning)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🟡</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--warning)" }}>Deload week active</div>
                <div className="muted" style={{ fontSize: 12 }}>Coach won't recommend calorie changes until it ends.</div>
              </div>
            </div>
          </Card>
        )}

        <div style={{ background: meta ? meta.gradient : "var(--surface-2)", borderRadius: 18, padding: 18, color: meta ? "#fff" : "var(--text)", boxShadow: meta ? "0 8px 20px -8px rgba(0,0,0,0.25)" : "none", marginBottom: 4 }}>
          {review ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StateIcon icon={meta.icon} color="#fff" size={22} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.9 }}>{meta.label}</span>
              </div>
              <p style={{ fontWeight: 600, fontSize: 14.5, margin: "8px 0 10px" }}>{review.recommendation_text}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowEvidence(!showEvidence)} style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 12, cursor: "pointer" }}>
                  {showEvidence ? "Hide evidence" : "Why?"}
                </button>
                <button onClick={() => navigate(`/coach/review/${review.id}`)} style={{ background: "#fff", border: "none", borderRadius: 10, padding: "8px 12px", color: "var(--primary-ink)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Full review
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "6px 0" }}>
              <svg width="30" height="30" viewBox="0 0 24 24" style={{ opacity: 0.5, margin: "0 auto 8px" }}>
                <path d="M12 3l9 16H3l9-16z M12 10v4 M12 17h.01" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="muted" style={{ marginBottom: 10 }}>No weekly review yet — one runs automatically every Sunday.</div>
              <button onClick={runReviewNow} disabled={runningReview} style={{ background: "var(--primary)", border: "none", borderRadius: 10, padding: "9px 16px", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                {runningReview ? "Running…" : "Run this week's review now"}
              </button>
            </div>
          )}
        </div>

        {showEvidence && review && (
          <>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <StatTile label="Weight" value={`${review.avg_weight_lb ?? "—"} lb`} values={weightSeries} color="var(--primary)" />
              <StatTile label="Waist" value={`${review.avg_waist_in ?? "—"} in`} values={waistSeries} color="var(--fat)" />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 8 }}>
              <StatTile label="Cal. adherence" value={`${review.calorie_adherence_pct ?? "—"}%`} values={calorieAdherenceSeries} color="var(--warning)" />
              <StatTile label="Training" value={`${review.workouts_completed}/${review.workouts_scheduled}`} values={trainingAdherenceSeries} color="var(--success)" />
            </div>
          </>
        )}

        {review?.progressive_overload_lb > 0 && (
          <Card style={{ background: "var(--success-tint)", borderColor: "var(--success)", marginTop: 10 }}>
            <div className="row">
              <div>
                <div className="eyebrow" style={{ color: "var(--success)", margin: 0 }}>Progressive overload this week</div>
                <div className="bigNum" style={{ fontSize: 20, color: "var(--success)" }}>+{review.progressive_overload_lb} lb</div>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>{review.exercises_improved} exercise{review.exercises_improved === 1 ? "" : "s"}</span>
            </div>
          </Card>
        )}

        {review && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Link to="/coach/history" style={{ flex: 1, textAlign: "center", padding: "10px 0", borderRadius: 12, border: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-muted)", textDecoration: "none" }}>Review history</Link>
            <button onClick={runReviewNow} disabled={runningReview} style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "1px dashed var(--border)", background: "none", fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>
              {runningReview ? "Running…" : "Run again"}
            </button>
          </div>
        )}

        <Card onClick={() => navigate("/coach/goal")} style={{ cursor: "pointer", marginTop: 14, background: "linear-gradient(135deg, var(--primary-tint) 0%, var(--primary-tint) 100%)", borderColor: "var(--primary)" }}>
          <div className="row">
            <div>
              <div className="eyebrow" style={{ color: "var(--primary)", margin: 0 }}>⚑ Weight goal</div>
              <p style={{ fontWeight: 700, fontSize: 15, margin: "2px 0" }}>{profile?.goal_weight_lb ? `${profile.goal_weight_lb} lb by ${new Date(profile.goal_target_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Not set"}</p>
            </div>
            <span style={{ color: "var(--primary)", fontSize: 13, fontWeight: 600 }}>{profile?.goal_weight_lb ? "Edit" : "Set →"}</span>
          </div>
        </Card>

        {pace && (
          <Card style={{
            background: pace.status === "ahead" ? "var(--success-tint)" : pace.status === "behind" ? "var(--warning-tint)" : "var(--surface-2)",
            borderColor: pace.status === "ahead" ? "var(--success)" : pace.status === "behind" ? "var(--warning)" : "var(--border)",
          }}>
            <div className="row">
              <div>
                <div className="eyebrow" style={{ margin: 0, color: pace.status === "ahead" ? "var(--success)" : pace.status === "behind" ? "var(--warning)" : "var(--text-muted)" }}>Pace</div>
                <p style={{ fontWeight: 700, fontSize: 15, margin: "2px 0" }}>
                  {pace.status === "ahead" ? `Ahead of pace by ${pace.diffLb} lb` : pace.status === "behind" ? `Behind pace by ${pace.diffLb} lb` : "Right on pace"}
                </p>
              </div>
              <span className="muted" style={{ fontSize: 11.5 }}>Expected {pace.expectedWeight} lb</span>
            </div>
          </Card>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <Card onClick={() => navigate("/train")} style={{ cursor: "pointer", flex: 1, background: "var(--primary-tint)", borderColor: "var(--border)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" style={{ marginBottom: 4 }}><path d="M6.5 8.5v7M4 10v4M2 11.5v1M17.5 8.5v7M20 10v4M22 11.5v1M8 12h8" fill="none" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <div className="row" style={{ marginBottom: 2 }}>
              <span className="eyebrow" style={{ margin: 0, color: "var(--primary)" }}>Training</span>
              {activeSplit && <Pill tone={activeSplit.source === "coach_generated" ? "blue" : "gray"}>{activeSplit.source === "coach_generated" ? "Coach" : "Custom"}</Pill>}
            </div>
            <p style={{ fontWeight: 700, fontSize: 14, margin: "2px 0" }}>{uniqueTemplates.map((t) => t.workout_templates?.name).join(" / ") || "No program yet"}</p>
            <div className="muted" style={{ fontSize: 11.5 }}>{templates.length} days/week</div>
          </Card>

          <Card onClick={() => navigate("/profile")} style={{ cursor: "pointer", flex: 1, background: "var(--warning-tint)", borderColor: "var(--border)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" style={{ marginBottom: 4 }}><path d="M6 3v8a3 3 0 0 0 3 3v7M6 3v6M8 3v6M4 3v6M17 3c-2 1-2.5 4-2.5 6 0 2 1 3 2.5 3v9" fill="none" stroke="var(--warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div className="eyebrow" style={{ color: "var(--warning)" }}>Nutrition</div>
            <p style={{ fontWeight: 700, fontSize: 14, margin: "2px 0" }}>{targets?.calories ?? "—"} kcal</p>
            <div className="muted" style={{ fontSize: 11.5 }}>{targets?.protein_g ?? "—"}g protein</div>
          </Card>
        </div>

        <Card tight style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--success-tint)" }}>
          <RingProgress value={7 - daysUntilReview} max={7} size={40} strokeWidth={4} color="var(--success)">
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700 }}>{daysUntilReview}</div>
          </RingProgress>
          <div>
            <div className="eyebrow" style={{ margin: 0, color: "var(--success)" }}>Next review</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{daysUntilReview} day{daysUntilReview === 1 ? "" : "s"} — every Sunday</div>
          </div>
        </Card>

        <button className="btnPrimary" onClick={() => navigate("/coach/builder")}>Build My Program</button>

        <div className="eyebrow" style={{ marginTop: 20 }}>Ask EZfit</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {["Why aren't we lowering my calories?", "Why did my bench target increase?", "Am I overloading enough?"].map((q) => (
            <button key={q} className="pill gray" style={{ cursor: "pointer", border: "none" }} onClick={() => askEZfit(q)}>{q}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "82%", padding: "10px 13px", borderRadius: 16,
                borderBottomRightRadius: m.role === "user" ? 4 : 16,
                borderBottomLeftRadius: m.role === "assistant" ? 4 : 16,
                background: m.role === "user" ? "var(--primary)" : "var(--surface-2)",
                color: m.role === "user" ? "#fff" : "var(--text)",
                fontSize: 13.5, lineHeight: 1.5,
              }}>
                {m.text}
              </div>
            </div>
          ))}
          {asking && <div className="muted" style={{ fontSize: 12.5 }}>Thinking…</div>}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about your plan…" style={{ flex: 1, padding: 13, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
          <button className="btnGhost" style={{ width: "auto", padding: "0 16px" }} onClick={() => askEZfit(question)} disabled={asking || !question}>Ask</button>
        </div>
      </div>
      <BottomNav />
    </>
  );
}
