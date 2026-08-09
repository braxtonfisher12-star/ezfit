cat > src/components/Sparkline.jsx <<'PASTE_EOF'
// Tiny inline trend line — no axes, no labels, just shape. Used for the
// per-exercise 1RM sparkline in My Workouts.
export default function Sparkline({ values, width = 70, height = 24, color = "var(--primary)" }) {
  if (!values || values.length < 2) {
    return <div style={{ width, height, display: "flex", alignItems: "center" }}><span className="muted" style={{ fontSize: 10 }}>—</span></div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / Math.max(1, max - min)) * height;
      return `${x},${y}`;
    })
    .join(" ");
  const trendingUp = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height}>
      <polyline points={path} fill="none" stroke={trendingUp ? "var(--success)" : color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
PASTE_EOF

cat > src/pages/WorkoutLibrary.jsx <<'PASTE_EOF'
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Pill } from "../components/Card";
import Sparkline from "../components/Sparkline";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { estimatedOneRepMax } from "../lib/oneRepMax";

const DAYS = [[0, "Sun"], [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"]];

// Lists every workout template the user has built, whether or not it's
// currently assigned to a day — the gap the user flagged (built workouts
// disappeared once they weren't the active day's assignment). Lets you
// expand to see exercises, assign to a day directly, or delete.
export default function WorkoutLibrary() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [assignments, setAssignments] = useState({}); // template_id -> [day_of_week,...]
  const [expanded, setExpanded] = useState(null);
  const [exercisesByTemplate, setExercisesByTemplate] = useState({});
  const [sparklines, setSparklines] = useState({}); // exercise_id -> [oneRM,...]
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from("workout_templates").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("workout_day_assignments").select("*").eq("user_id", user.id),
    ]);
    setTemplates(t ?? []);
    const map = {};
    for (const row of a ?? []) {
      map[row.template_id] = map[row.template_id] || [];
      map[row.template_id].push(row.day_of_week);
    }
    setAssignments(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const toggleExpand = async (templateId) => {
    if (expanded === templateId) return setExpanded(null);
    setExpanded(templateId);
    if (!exercisesByTemplate[templateId]) {
      const { data } = await supabase.from("workout_template_exercises").select("*, exercise:exercises(name)").eq("template_id", templateId).order("order_index");
      setExercisesByTemplate((prev) => ({ ...prev, [templateId]: data ?? [] }));

      for (const row of data ?? []) {
        if (sparklines[row.exercise_id]) continue;
        const { data: sets } = await supabase
          .from("sets")
          .select("actual_weight, actual_reps, completed_at")
          .eq("user_id", user.id)
          .eq("exercise_id", row.exercise_id)
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: true })
          .limit(30);
        const byDay = {};
        for (const s of sets ?? []) {
          const day = s.completed_at.slice(0, 10);
          const oneRM = estimatedOneRepMax(s.actual_weight, s.actual_reps);
          if (!byDay[day] || oneRM > byDay[day]) byDay[day] = oneRM;
        }
        const trend = Object.values(byDay).slice(-8);
        setSparklines((prev) => ({ ...prev, [row.exercise_id]: trend }));
      }
    }
  };

  const assignToDay = async (templateId, dayOfWeek) => {
    const { error } = await supabase.from("workout_day_assignments").upsert(
      { user_id: user.id, day_of_week: dayOfWeek, template_id: templateId },
      { onConflict: "user_id,day_of_week" }
    );
    if (error) return alert(`Couldn't assign: ${error.message}`);
    load();
  };

  const deleteTemplate = async (templateId) => {
    if (!confirm("Delete this workout? This can't be undone.")) return;
    const { error } = await supabase.from("workout_templates").delete().eq("id", templateId);
    if (error) return alert(`Couldn't delete: ${error.message}`);
    load();
  };

  if (loading) return <div className="content">Loading…</div>;

  return (
    <div className="content">
      <div className="row">
        <h1 className="pageTitle" style={{ fontSize: 22 }}>My workouts</h1>
        <button className="btnGhost" style={{ width: "auto", padding: "8px 14px", fontSize: 12.5 }} onClick={() => navigate("/train/builder")}>+ New</button>
      </div>

      {templates.length === 0 && (
        <Card><div className="muted">No workouts built yet.</div></Card>
      )}

      {templates.map((t) => {
        const assignedDays = assignments[t.id] ?? [];
        const isExpanded = expanded === t.id;
        return (
          <Card key={t.id}>
            <div className="row" style={{ cursor: "pointer" }} onClick={() => toggleExpand(t.id)}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {assignedDays.length > 0 ? assignedDays.map((d) => DAYS.find((x) => x[0] === d)[1]).join(", ") : "Not scheduled"}
                </div>
              </div>
              <span className="muted">{isExpanded ? "▲" : "▼"}</span>
            </div>

            {isExpanded && (
              <div style={{ marginTop: 12 }}>
                {(exercisesByTemplate[t.id] ?? []).map((e, i) => (
                  <div key={e.id} className="row" style={{ padding: "6px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none", fontSize: 13 }}>
                    <span onClick={() => navigate(`/train/exercise/${e.exercise_id}`)} style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--border)" }}>{e.exercise?.name}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Sparkline values={sparklines[e.exercise_id]} />
                      <span className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{e.target_sets} × {e.target_reps_low}–{e.target_reps_high}</span>
                    </div>
                  </div>
                ))}

                <div className="eyebrow" style={{ marginTop: 12 }}>Assign to a day</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {DAYS.map(([d, label]) => (
                    <button
                      key={d}
                      onClick={() => assignToDay(t.id, d)}
                      style={{ padding: "6px 10px", borderRadius: 8, border: assignedDays.includes(d) ? "1.5px solid var(--primary)" : "1px solid var(--border)", background: assignedDays.includes(d) ? "var(--primary-tint)" : "var(--surface)", cursor: "pointer", fontSize: 12 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button className="btnGhost" style={{ marginTop: 12, color: "var(--critical)" }} onClick={() => deleteTemplate(t.id)}>Delete workout</button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
PASTE_EOF

cat > src/pages/Train.jsx <<'PASTE_EOF'
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import AvatarLink from "../components/AvatarLink";
import RingProgress from "../components/RingProgress";
import { Card, Pill } from "../components/Card";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { useProfile } from "../hooks/useProfile";
import { getWeekDates, toISODate, dayLabel } from "../lib/dateUtils";

export default function Train() {
  const { user } = useAuth();
  const { profile, saveProfile } = useProfile();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [templates, setTemplates] = useState({});
  const [sessionsByDate, setSessionsByDate] = useState({}); // iso -> {status, label}
  const [activeSplit, setActiveSplit] = useState(null);
  const [streak, setStreak] = useState(0);

  const week = getWeekDates();

  const load = async () => {
    if (!user) return;
    const { data: a } = await supabase.from("workout_day_assignments").select("*, workout_templates(name)").eq("user_id", user.id);
    setAssignments(a ?? []);
    const map = {};
    (a ?? []).forEach((row) => { map[row.day_of_week] = row; });
    setTemplates(map);

    const { data: sessions } = await supabase
      .from("workout_sessions")
      .select("session_date, status, day_label")
      .eq("user_id", user.id)
      .gte("session_date", toISODate(week[0]))
      .lte("session_date", toISODate(week[6]));
    const sMap = {};
    for (const s of sessions ?? []) sMap[s.session_date] = { status: s.status, label: s.day_label };
    setSessionsByDate(sMap);

    const { data: split } = await supabase.from("training_splits").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setActiveSplit(split);

    const { data: recentComplete } = await supabase
      .from("workout_sessions")
      .select("session_date")
      .eq("user_id", user.id)
      .eq("status", "complete")
      .order("session_date", { ascending: false })
      .limit(30);
    setStreak(computeStreak((recentComplete ?? []).map((s) => s.session_date)));
  };

  useEffect(() => { load(); }, [user]);

  const toggleDeload = async () => {
    await saveProfile({ deload_week: !profile?.deload_week });
    load();
  };

  const actionChips = [
    ["My workouts", "/train/library"],
    ["Build a split", "/train/split"],
    ["+ Build workout", "/train/builder"],
    ["+ Log cardio", "/train/cardio"],
  ];

  return (
    <>
      <div className="content">
        <div className="row">
          <h1 className="pageTitle">Train</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {streak > 0 && <Pill tone="blue">🔥 {streak} day{streak === 1 ? "" : "s"}</Pill>}
            <AvatarLink />
          </div>
        </div>
        <p className="muted">{activeSplit ? activeSplit.name : "What do you need to beat today?"}</p>

        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10, paddingBottom: 2 }}>
          {actionChips.map(([label, path]) => (
            <button key={path} className="btnGhost" style={{ width: "auto", padding: "8px 12px", fontSize: 12, whiteSpace: "nowrap" }} onClick={() => navigate(path)}>
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={toggleDeload}
          style={{
            width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 12, marginBottom: 14, cursor: "pointer",
            border: profile?.deload_week ? "1.5px solid var(--warning)" : "1px dashed var(--border)",
            background: profile?.deload_week ? "var(--warning-tint)" : "transparent",
            fontSize: 12.5, color: profile?.deload_week ? "var(--warning)" : "var(--text-muted)",
          }}
        >
          {profile?.deload_week ? "🟡 Deload week is ON — tap to turn off" : "Tap to mark this a deload week (lighter, shorter sessions)"}
        </button>

        {week.map((d) => {
          const iso = toISODate(d);
          const isToday = iso === toISODate(new Date());
          const assignment = templates[d.getDay()];
          const session = sessionsByDate[iso];
          const label = session?.label ?? assignment?.workout_templates?.name;
          const ringColor = session?.status === "complete" ? "var(--success)" : session?.status === "skipped" ? "var(--critical)" : (label ?? assignment) ? "var(--primary)" : "var(--border)";
          const ringValue = session?.status === "complete" ? 1 : session?.status === "skipped" ? 1 : 0;
          return (
            <Card
              key={iso}
              tight
              onClick={() => (label || assignment) && navigate(`/train/day/${iso}`)}
              style={{
                cursor: label || assignment ? "pointer" : "default",
                borderColor: isToday ? "var(--primary)" : "var(--border)",
                background: isToday ? "var(--primary-tint)" : "var(--surface)",
              }}
            >
              <div className="row">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <RingProgress value={ringValue} max={1} size={34} strokeWidth={3} color={ringColor}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700 }}>{d.getDate()}</div>
                  </RingProgress>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{dayLabel(d)}</div>
                    <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: 2 }}>{label ?? "Rest day"}</div>
                  </div>
                </div>
                {session?.status === "complete" ? <Pill tone="green">Done</Pill>
                  : session?.status === "skipped" ? <Pill tone="gray">Skipped</Pill>
                  : (label ?? assignment) ? <Pill tone="blue">{isToday ? "Today" : "Scheduled"}</Pill>
                  : <Pill tone="gray">—</Pill>}
              </div>
            </Card>
          );
        })}

        {assignments.length === 0 && (
          <Card>
            <div className="muted">No workouts built yet. Tap "+ Build workout" to create your first one, or "My workouts" once you have a few to arrange them into a split.</div>
          </Card>
        )}
      </div>
      <BottomNav />
    </>
  );
}

// Consecutive-day streak counting back from today (or yesterday, so a
// streak isn't broken just because today hasn't happened yet).
function computeStreak(dates) {
  const set = new Set(dates);
  let streak = 0;
  let cursor = new Date();
  if (!set.has(toISODate(cursor)) && set.has(toISODate(addDays(cursor, -1)))) cursor = addDays(cursor, -1);
  while (set.has(toISODate(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
PASTE_EOF

