import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Pill } from "../../components/Card";
import StateIcon from "../../components/StateIcon";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth";
import { STATE_META } from "../../lib/coachStates";

export default function CoachHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("weekly_reviews").select("*").eq("user_id", user.id).order("week_start", { ascending: false });
      setReviews(data ?? []);
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <div className="content">Loading…</div>;

  return (
    <div className="content">
      <button onClick={() => navigate("/coach")} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 10 }}>&larr; Back</button>
      <h1 className="pageTitle" style={{ fontSize: 22 }}>Review history</h1>
      {reviews.length === 0 && <Card><div className="muted">No reviews yet.</div></Card>}

      <div style={{ position: "relative", paddingLeft: 8, marginTop: 10 }}>
        {reviews.length > 0 && <div style={{ position: "absolute", left: 23, top: 6, bottom: 6, width: 1.5, background: "var(--border)" }} />}
        {reviews.map((r) => {
          const meta = STATE_META[r.decision_state] ?? STATE_META.gray;
          return (
            <div key={r.id} onClick={() => navigate(`/coach/review/${r.id}`)} style={{ display: "flex", gap: 12, marginBottom: 14, cursor: "pointer", position: "relative" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: meta.gradient, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1, boxShadow: "0 0 0 4px var(--bg)" }}>
                <StateIcon icon={meta.icon} color="#fff" size={15} />
              </div>
              <Card tight style={{ flex: 1, marginBottom: 0 }}>
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>Week of {r.week_start}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{meta.label}</div>
                  </div>
                  {r.progressive_overload_lb > 0 && <Pill tone="green">+{r.progressive_overload_lb} lb</Pill>}
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
