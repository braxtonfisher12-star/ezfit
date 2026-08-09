import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth";
import { useProfile } from "../../hooks/useProfile";
import { STATE_META, stateDirection } from "../../lib/coachStates";
import { recalcMacrosForCalorieChange } from "../../lib/macroRecalc";
import StateIcon from "../../components/StateIcon";
import DualSparkline from "../../components/DualSparkline";
import ConfettiBurst from "../../components/ConfettiBurst";

// Instagram-story-style walkthrough: weight -> waist -> strength/sleep
// correlation -> progressive overload -> final verdict with accept/decline.
// Tapping the right side advances, left side goes back. Marked "viewed"
// the moment it opens so the full-screen takeover never nags twice.
export default function ReviewStory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { targets, saveTargets } = useProfile();
  const [review, setReview] = useState(null);
  const [history, setHistory] = useState([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: h }] = await Promise.all([
        supabase.from("weekly_reviews").select("*").eq("id", id).eq("user_id", user.id).single(),
        supabase.from("weekly_reviews").select("*").eq("user_id", user.id).order("week_start", { ascending: true }).limit(8),
      ]);
      setReview(r);
      setHistory(h ?? []);
      setLoading(false);
      await supabase.from("weekly_reviews").update({ viewed_at: new Date().toISOString() }).eq("id", id);
    })();
  }, [id, user]);

  if (loading || !review) return <div className="content" style={{ paddingTop: 100, textAlign: "center" }}>Loading…</div>;

  const meta = STATE_META[review.decision_state] ?? STATE_META.gray;
  const direction = stateDirection(review.decision_state);
  const sleepSeries = history.map((h) => h.avg_sleep_minutes).filter((v) => v != null);
  const overloadSeries = history.map((h) => h.progressive_overload_lb ?? 0);
  const isLatest = history.length > 0 && history[history.length - 1].id === review.id;
  const canAct = isLatest && review.user_response === "pending" && review.recommended_calorie_change !== 0;

  const cards = [
    { kind: "weight" },
    { kind: "waist" },
    { kind: "strength" },
    { kind: "overload" },
    { kind: "verdict" },
  ];

  const advance = (e) => {
    if (e) {
      const x = e.clientX;
      const width = window.innerWidth;
      if (x < width * 0.3) {
        setCardIndex((i) => Math.max(0, i - 1));
        return;
      }
    }
    if (cardIndex < cards.length - 1) {
      setCardIndex(cardIndex + 1);
      if (cards[cardIndex + 1].kind === "verdict" && review.decision_state === "green") setShowConfetti(true);
    } else {
      navigate("/coach");
    }
  };

  const accept = async (ev) => {
    ev.stopPropagation();
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
    navigate("/coach");
  };

  const decline = async (ev) => {
    ev.stopPropagation();
    setActing(true);
    await supabase.from("weekly_reviews").update({ user_response: "declined" }).eq("id", review.id);
    setActing(false);
    navigate("/coach");
  };

  const card = cards[cardIndex];
  const bg = card.kind === "verdict" ? meta.gradient : "linear-gradient(135deg, #1A1C21 0%, #2C2F36 100%)";

  return (
    <div onClick={advance} style={{ position: "fixed", inset: 0, background: bg, color: "#fff", display: "flex", flexDirection: "column", cursor: "pointer" }}>
      {showConfetti && <ConfettiBurst />}
      <div style={{ display: "flex", gap: 4, padding: "14px 14px 0" }}>
        {cards.map((c, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: i <= cardIndex ? "#fff" : "rgba(255,255,255,0.3)" }} />
        ))}
      </div>
      <button onClick={(e) => { e.stopPropagation(); navigate("/coach"); }} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>&times;</button>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 28px", textAlign: "center" }}>
        {card.kind === "weight" && (
          <>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em" }}>Body weight</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 36, margin: "10px 0" }}>{review.avg_weight_lb ?? "—"} lb</div>
            <div style={{ opacity: 0.85, fontSize: 14 }}>{review.weight_trend === "down" ? "Trending down this week" : review.weight_trend === "up" ? "Trending up this week" : "Holding steady this week"}</div>
          </>
        )}
        {card.kind === "waist" && (
          <>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em" }}>Waist</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 36, margin: "10px 0" }}>{review.avg_waist_in ?? "—"} in</div>
            <div style={{ opacity: 0.85, fontSize: 14 }}>{review.waist_trend === "down" ? "Trending down this week" : review.waist_trend === "up" ? "Trending up this week" : "Holding steady this week"}</div>
          </>
        )}
        {card.kind === "strength" && (
          <>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em" }}>Strength & recovery</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, margin: "10px 0" }}>
              {review.strength_trend === "improving" ? "Improving" : review.strength_trend === "declining" ? "Declining" : "Stable"}
            </div>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 14, padding: 16 }}>
              <DualSparkline seriesA={sleepSeries} seriesB={overloadSeries} width={220} height={50} />
            </div>
          </>
        )}
        {card.kind === "overload" && (
          <>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em" }}>Progressive overload</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 36, margin: "10px 0" }}>+{review.progressive_overload_lb ?? 0} lb</div>
            <div style={{ opacity: 0.85, fontSize: 14 }}>across {review.exercises_improved ?? 0} exercise{review.exercises_improved === 1 ? "" : "s"} this week</div>
          </>
        )}
        {card.kind === "verdict" && (
          <>
            <StateIcon icon={meta.icon} color="#fff" size={40} />
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, margin: "12px 0 8px" }}>{meta.label}</div>
            <div style={{ fontSize: 14, opacity: 0.95, marginBottom: 18 }}>{review.recommendation_text}</div>
            {canAct && (
              <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 10 }}>
                <button onClick={decline} disabled={acting} style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 12, padding: "12px 18px", color: "#fff", fontSize: 13, cursor: "pointer" }}>Keep current</button>
                <button onClick={accept} disabled={acting} style={{ background: "#fff", border: "none", borderRadius: 12, padding: "12px 18px", color: "var(--primary-ink)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{acting ? "…" : "Accept change"}</button>
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ textAlign: "center", padding: "0 0 20px", fontSize: 11, opacity: 0.6 }}>Tap to continue</div>
    </div>
  );
}
