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
import { computeBlockWeek } from "../lib/trainingBlock";

const DUMBBELL_PATH = "M6.5 8.5v7M4 10v4M2 11.5v1M17.5 8.5v7M20 10v4M22 11.5v1M8 12h8";
const LEAF_PATH = "M4 20c8 0 14-6 14-14V4h-2C8 4 4 10 4 18v2z M4 20l7-7";
const CHECK_PATH = "M5 12l4 4 10-10";
const X_PATH = "M6 6l12 12M18 6L6 18";
const MUSCLE_LABELS = { chest: "Chest", back: "Back", shoulders: "Shoulders", arms: "Arms", legs: "Legs", glutes: "Glutes", core: "Core" };
const MUSCLE_COLORS = {
  chest: "var(--primary)",
  back: "#7B5FD1",
  shoulders: "#2E9E8F",
  arms: "var(--warning)",
  legs: "var(--success)",
  glutes: "#D1608F",
  core: "#6B7280",
};

function DayIcon({ kind, color }) {
  const path = kind === "workout" ? DUMBBELL_PATH : kind === "done" ? CHECK_PATH : kind === "skipped" ? X_PATH : LEAF_PATH;
  return (
    <svg width="15" height="15" viewBox="0 0 24 24">
      <path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Train() {
  const { user } = useAuth();
  const { profile, saveProfile } = useProfile();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [templates, setTemplates] = useState({});
  const [sessionsByDate, setSessionsByDate] = useState({});
  const [activeSplit, setActiveSplit] = useState(null);
  const [activeBlock, setActiveBlock] = useState(null);
  const [streak, setStreak] = useState(0);
  const [muscleVolume, setMuscleVolume] = useState([]);
  const [compactMode, setCompactMode] = useState(false);

  const week = getWeekDates();
  const todayISO = toISODate(new Date());

  const load = async () => {
    if (!user) return;
    const { data: a } = await supabase.from("workout_day_assignments").select("*, workout_templates(name)").eq("user_id", user.id);
    setAssignments(a ?? []);
    const map = {};
    (a ?? []).forEach((row) => { map[row.day_of_week] = row; });
    setTemplates(map);

    const { data: sessions } = await supabase
      .from("workout_sessions")
      .select("session_date, status, day_label, duration_minutes")
      .eq("user_id", user.id)
      .gte("session_date", toISODate(week[0]))
      .lte("session_date", toISODate(week[6]));
    const sMap = {};
    for (const s of sessions ?? []) sMap[s.session_date] = { status: s.status, label: s.day_label, duration: s.duration_minutes };
    setSessionsByDate(sMap);

    const { data: split } = await supabase.from("training_splits").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setActiveSplit(split);

    const { data: block } = await supabase.from("training_blocks").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setActiveBlock(block);

    const { data: recentComplete } = await supabase
      .from("workout_sessions")
      .select("session_date")
      .eq("user_id", user.id)
      .eq("status", "complete")
      .order("session_date", { ascending: false })
      .limit(30);
    setStreak(computeStreak((recentComplete ?? []).map((s) => s.session_date)));

    const weekStartISO = toISODate(week[0]);
    const weekEndISO = toISODate(week[6]);
    const { data: weekSets } = await supabase
      .from("sets")
      .select("exercise_id, exercises(muscle_group)")
      .eq("user_id", user.id)
      .gte("completed_at", weekStartISO)
      .lte("completed_at", weekEndISO + "T23:59:59");
    const counts = {};
    for (const s of weekSets ?? []) {
      const group = s.exercises?.muscle_group;
      if (!group) continue;
      counts[group] = (counts[group] || 0) + 1;
    }
    setMuscleVolume(Object.entries(counts).sort((a, b) => b[1] - a[1]));
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

  const scheduledCount = week.filter((d) => templates[d.getDay()] || sessionsByDate[toISODate(d)]?.label).length;
  const completedCount = week.filter((d) => sessionsByDate[toISODate(d)]?.status === "complete").length;
  const prWeekPct = scheduledCount ? Math.round((completedCount / scheduledCount) * 100) : 0;

  const nextUp = (() => {
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const iso = toISODate(d);
      const assignment = templates[d.getDay()];
      const session = sessionsByDate[iso];
      const label = session?.label ?? assignment?.workout_templates?.name;
      if (!label) continue;
      if (session?.status === "complete" || session?.status === "skipped") continue;
      return { label, iso, isToday: i === 0, dayName: dayLabel(d) };
    }
    return null;
  })();

  const blockWeek = activeBlock ? computeBlockWeek(activeBlock.start_date, activeBlock.length_weeks) : null;
  const maxVolume = Math.max(1, ...muscleVolume.map(([, count]) => count));

  return (
    <>
      <div className="content">
        <div className="row">
          <h1 className="pageTitle">Train</h1>
          <AvatarLink />
        </div>
        <p className="muted">{activeSplit ? activeSplit.name : "What do you need to beat today?"}</p>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, background: "linear-gradient(135deg, var(--primary) 0%, #4A63FF 100%)", borderRadius: 16, padding: "14px 16px", color: "#fff", boxShadow: "0 6px 16px -6px rgba(43,76,255,0.45)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em" }}>This week</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, marginTop: 2 }}>{completedCount}<span style={{ fontSize: 14, opacity: 0.75, fontWeight: 500 }}>/{scheduledCount || 0}</span></div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.25)", borderRadius: 99, marginTop: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${prWeekPct}%`, background: "#fff", borderRadius: 99, transition: "width 700ms cubic-bezier(0.4,0,0.2,1)" }} />
            </div>
          </div>
          <div style={{ flex: 1, background: streak > 0 ? "var(--warning-tint)" : "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 16px", boxShadow: streak > 0 ? "0 6px 16px -8px rgba(198,134,42,0.35)" : "none" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Streak</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, marginTop: 2, color: streak > 0 ? "var(--warning)" : "var(--text)" }}>
              {streak > 0 ? <><span className={streak >= 7 ? "flame-pulse" : ""}>🔥</span> {streak}</> : "0"}<span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}> day{streak === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>

        {activeBlock && (
          <Card onClick={() => blockWeek.isComplete && navigate("/train/block-review")} style={{ cursor: blockWeek.isComplete ? "pointer" : "default", boxShadow: "0 4px 14px -8px rgba(0,0,0,0.12)" }}>
            <div className="row">
              <span className="eyebrow" style={{ margin: 0 }}>{activeBlock.name}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>Week {blockWeek.week} / {activeBlock.length_weeks}</span>
            </div>
            <div className="progressTrack" style={{ marginTop: 8 }}>
              <div className="progressFill" style={{ width: `${Math.min(100, (blockWeek.week / activeBlock.length_weeks) * 100)}%` }} />
            </div>
            {blockWeek.isComplete && <div style={{ marginTop: 8 }}><Pill tone="blue">Block complete — tap to review</Pill></div>}
          </Card>
        )}

        {nextUp && (
          <Card onClick={() => navigate(`/train/day/${nextUp.iso}`)} style={{ cursor: "pointer", borderColor: "var(--primary)", boxShadow: "0 6px 18px -10px rgba(43,76,255,0.4)" }}>
            <div className="eyebrow" style={{ color: "var(--primary)" }}>Next up</div>
            <div className="row">
              <div style={{ fontWeight: 700, fontSize: 15.5 }}>{nextUp.label}</div>
              <Pill tone="blue">{nextUp.isToday ? "Today" : nextUp.dayName}</Pill>
            </div>
          </Card>
        )}

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
            width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 12, marginBottom: 12, cursor: "pointer",
            border: profile?.deload_week ? "1.5px solid var(--warning)" : "1px dashed var(--border)",
            background: profile?.deload_week ? "var(--warning-tint)" : "transparent",
            fontSize: 12.5, color: profile?.deload_week ? "var(--warning)" : "var(--text-muted)",
          }}
        >
          {profile?.deload_week ? "🟡 Deload week is ON — tap to turn off" : "Tap to mark this a deload week (lighter, shorter sessions)"}
        </button>

        <div className="row" style={{ marginBottom: 8 }}>
          <span className="eyebrow" style={{ margin: 0 }}>This week</span>
          <button
            onClick={() => setCompactMode(!compactMode)}
            style={{ background: "none", border: "none", color: "var(--primary)", fontSize: 11.5, cursor: "pointer", padding: 0 }}
          >
            {compactMode ? "Full view" : "Compact view"}
          </button>
        </div>

        {compactMode ? (
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {week.map((d) => {
              const iso = toISODate(d);
              const assignment = templates[d.getDay()];
              const session = sessionsByDate[iso];
              const label = session?.label ?? assignment?.workout_templates?.name;
              const hasWorkout = !!(label || assignment);
              const ringColor = session?.status === "complete" ? "var(--success)" : session?.status === "skipped" ? "var(--critical)" : hasWorkout ? "var(--primary)" : "var(--border)";
              const ringValue = session?.status === "complete" || session?.status === "skipped" ? 1 : 0;
              return (
                <div key={iso} onClick={() => hasWorkout && navigate(`/train/day/${iso}`)} style={{ flex: 1, textAlign: "center", cursor: hasWorkout ? "pointer" : "default" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-faint)" }}>{dayLabel(d)}</div>
                  <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
                    <RingProgress value={ringValue} max={1} size={30} strokeWidth={3} color={ringColor}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700 }}>{d.getDate()}</div>
                    </RingProgress>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          week.map((d) => {
            const iso = toISODate(d);
            const isToday = iso === todayISO;
            const isPast = iso < todayISO;
            const assignment = templates[d.getDay()];
            const session = sessionsByDate[iso];
            const label = session?.label ?? assignment?.workout_templates?.name;
            const hasWorkout = !!(label || assignment);
            const isDone = session?.status === "complete" || session?.status === "skipped";

            const ringColor = session?.status === "complete" ? "var(--success)" : session?.status === "skipped" ? "var(--critical)" : hasWorkout ? "var(--primary)" : "var(--border)";
            const ringValue = isDone ? 1 : 0;
            const iconKind = session?.status === "complete" ? "done" : session?.status === "skipped" ? "skipped" : hasWorkout ? "workout" : "rest";
            const accentColor = session?.status === "complete" ? "var(--success)" : session?.status === "skipped" ? "var(--critical)" : hasWorkout ? "var(--primary)" : "transparent";

            if (isDone && isPast) {
              return (
                <div
                  key={iso}
                  onClick={() => navigate(`/train/day/${iso}`)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    padding: "8px 12px", marginBottom: 6, borderRadius: 10, cursor: "pointer",
                    borderLeft: `3px solid ${accentColor}`, background: "var(--surface-2)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <DayIcon kind={iconKind} color={accentColor} />
                    <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{dayLabel(d)} · {label}</span>
                  </div>
                  {session?.status === "complete" ? <Pill tone="green">Done</Pill> : <Pill tone="red">Skipped</Pill>}
                </div>
              );
            }

            return (
              <Card
                key={iso}
                tight={!isToday}
                onClick={() => hasWorkout && navigate(`/train/day/${iso}`)}
                style={{
                  cursor: hasWorkout ? "pointer" : "default",
                  borderColor: isToday ? "var(--primary)" : "var(--border)",
                  borderLeft: `4px solid ${accentColor}`,
                  borderWidth: isToday ? 2 : 1,
                  background: isToday ? "var(--primary-tint)" : "var(--surface)",
                  padding: isToday ? 20 : undefined,
                  boxShadow: isToday ? "0 8px 20px -10px rgba(43,76,255,0.35)" : "none",
                  transform: isToday ? "scale(1.01)" : "none",
                }}
              >
                <div className="row">
                  <div style={{ display: "flex", alignItems: "center", gap: isToday ? 14 : 12 }}>
                    <RingProgress value={ringValue} max={1} size={isToday ? 42 : 34} strokeWidth={isToday ? 4 : 3} color={ringColor}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: isToday ? 14 : 12, fontWeight: 700 }}>{d.getDate()}</div>
                    </RingProgress>
                    <div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: isToday ? 12 : 11, color: "var(--text-muted)" }}>{dayLabel(d)}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <DayIcon kind={iconKind} color={accentColor === "transparent" ? "var(--text-faint)" : accentColor} />
                        <span style={{ fontWeight: 600, fontSize: isToday ? 17 : 14.5 }}>{label ?? "Rest day"}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    {session?.status === "complete" ? <Pill tone="green">Done</Pill>
                      : session?.status === "skipped" ? <Pill tone="red">Skipped</Pill>
                      : hasWorkout ? <Pill tone="blue">{isToday ? "Today" : "Scheduled"}</Pill>
                      : <Pill tone="gray">Rest</Pill>}
                    {session?.duration && <span className="muted" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>{session.duration} min</span>}
                  </div>
                </div>
              </Card>
            );
          })
        )}

        {muscleVolume.length > 0 && (
          <Card style={{ marginTop: 4 }}>
            <div className="eyebrow">Volume this week</div>
            {muscleVolume.map(([group, count]) => (
              <div key={group} style={{ marginBottom: 8, marginTop: 8 }}>
                <div className="row" style={{ fontSize: 12.5, marginBottom: 3 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: MUSCLE_COLORS[group] ?? "var(--primary)", display: "inline-block" }} />
                    {MUSCLE_LABELS[group] ?? group}
                  </span>
                  <span className="muted" style={{ fontFamily: "var(--font-mono)" }}>{count} sets</span>
                </div>
                <div className="macroBar">
                  <div className="macroFill" style={{ width: `${(count / maxVolume) * 100}%`, background: MUSCLE_COLORS[group] ?? "var(--primary)" }} />
                </div>
              </div>
            ))}
          </Card>
        )}

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
