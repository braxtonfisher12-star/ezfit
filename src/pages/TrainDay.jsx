import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import HoldButton from "../components/HoldButton";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

// Full-screen blue "hold to start" view for one specific date. Looks up
// that weekday's assigned template; if the session for this date is already
// complete, shows a summary instead of letting you restart it.
export default function TrainDay() {
  const { date } = useParams(); // 'YYYY-MM-DD'
  const { user } = useAuth();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [existingSession, setExistingSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const dow = new Date(date + "T00:00:00").getDay();
      const { data: assignment } = await supabase
        .from("workout_day_assignments")
        .select("*, workout_templates(*, workout_template_exercises(*, exercise:exercises(*)))")
        .eq("user_id", user.id)
        .eq("day_of_week", dow)
        .maybeSingle();
      setTemplate(assignment?.workout_templates ?? null);

      const { data: session } = await supabase
        .from("workout_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("session_date", date)
        .maybeSingle();
      setExistingSession(session);
      setLoading(false);
    })();
  }, [user, date]);

  if (loading) return <div className="content">Loading…</div>;

  if (!template) {
    return (
      <div className="content" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", textAlign: "center" }}>
        <div className="eyebrow">Rest day</div>
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18 }}>Recovery is part of training.</p>
        <button className="btnGhost" style={{ marginTop: 16 }} onClick={() => navigate("/train")}>Back to Train</button>
      </div>
    );
  }

  if (existingSession?.status === "complete") {
    return (
      <div className="content" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", textAlign: "center" }}>
        <div className="eyebrow">Already complete</div>
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18 }}>{template.name} — done for {date}.</p>
        <button className="btnGhost" style={{ marginTop: 16 }} onClick={() => navigate("/train")}>Back to Train</button>
      </div>
    );
  }

  const startWorkout = async () => {
    let session = existingSession;
    if (!session) {
      const { data } = await supabase
        .from("workout_sessions")
        .insert({ user_id: user.id, day_label: template.name, session_date: date })
        .select()
        .single();
      session = data;
    }
    navigate("/train/active", { state: { sessionId: session.id, templateId: template.id } });
  };

  const exerciseCount = template.workout_template_exercises?.length ?? 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "var(--primary)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30,
      }}
    >
      <div style={{ textAlign: "center", color: "#fff" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.06em" }}>{template.name}</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 15, opacity: 0.9, marginTop: 4 }}>{exerciseCount} exercises</div>
      </div>
      <HoldButton label="Hold to start" onComplete={startWorkout} />
      <button onClick={() => navigate("/train")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: "pointer" }}>
        Back
      </button>
    </div>
  );
}
