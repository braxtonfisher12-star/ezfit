mkdir -p src/pages/coach

cat > src/lib/coachStates.js <<'PASTE_EOF'
// Shared visual mapping for the six Coach decision states (spec section 35).
export const STATE_META = {
  green:  { emoji: "🟢", tone: "green", label: "On track" },
  yellow: { emoji: "🟡", tone: "amber", label: "Watching" },
  orange: { emoji: "🟠", tone: "amber", label: "Adherence first" },
  blue:   { emoji: "🔵", tone: "blue",  label: "Consider more fuel" },
  purple: { emoji: "🟣", tone: "blue",  label: "Small adjustment" },
  gray:   { emoji: "⚪", tone: "gray",  label: "Need more data" },
};
PASTE_EOF

cat > src/lib/programGenerator.js <<'PASTE_EOF'
// Deterministic program generator — Coach spec sections 4-11. Given the
// program-builder inputs and the tagged exercise library, returns a split
// (day-by-day exercise lists with sets/rep ranges), no AI involved. This
// keeps "Build My Program" fast, reproducible, and explainable — the "Why
// this program?" panel is just describing what this function already did.

const SPLITS = {
  2: [{ label: "Full Body A", muscles: ["chest", "back", "legs", "shoulders"] }, { label: "Full Body B", muscles: ["legs", "back", "chest", "arms"] }],
  3: [{ label: "Upper A", muscles: ["chest", "back", "shoulders", "arms"] }, { label: "Lower", muscles: ["legs", "glutes", "core"] }, { label: "Upper B", muscles: ["chest", "back", "shoulders", "arms"] }],
  4: [{ label: "Upper A", muscles: ["chest", "back", "shoulders", "arms"] }, { label: "Lower A", muscles: ["legs", "glutes"] }, { label: "Upper B", muscles: ["chest", "back", "shoulders", "arms"] }, { label: "Lower B", muscles: ["legs", "glutes", "core"] }],
  5: [{ label: "Push", muscles: ["chest", "shoulders", "arms"] }, { label: "Pull", muscles: ["back", "arms"] }, { label: "Legs", muscles: ["legs", "glutes"] }, { label: "Upper", muscles: ["chest", "back", "shoulders"] }, { label: "Lower", muscles: ["legs", "glutes", "core"] }],
};

// Reverse-pyramid compounds get the front slots (they carry the session);
// straight-set accessories fill out volume. Priority muscle groups get one
// extra accessory slot each, capped so program balance isn't destroyed
// (spec section 9: "should not completely destroy program balance").
function pickExercisesForDay(muscles, library, { priorities = [], dislikedIds = [], perDaySlots = 7 }) {
  const usable = library.filter((e) => !dislikedIds.includes(e.id));
  const compounds = usable.filter((e) => e.progression_method === "reverse_pyramid" && muscles.includes(e.muscle_group));
  const accessories = usable.filter((e) => e.progression_method === "straight_set" && muscles.includes(e.muscle_group));

  const chosen = [];
  const seenMuscles = new Set();
  for (const c of compounds) {
    if (chosen.length >= perDaySlots) break;
    chosen.push(c);
    seenMuscles.add(c.muscle_group);
  }
  // one accessory per remaining muscle group first, then extra slots to priorities
  const byMuscle = {};
  for (const a of accessories) {
    byMuscle[a.muscle_group] = byMuscle[a.muscle_group] || [];
    byMuscle[a.muscle_group].push(a);
  }
  for (const m of muscles) {
    if (chosen.length >= perDaySlots) break;
    const pick = (byMuscle[m] || []).find((a) => !chosen.includes(a));
    if (pick) chosen.push(pick);
  }
  for (const m of priorities) {
    if (chosen.length >= perDaySlots) break;
    if (!muscles.includes(m)) continue;
    const extra = (byMuscle[m] || []).find((a) => !chosen.includes(a));
    if (extra) chosen.push(extra);
  }
  return chosen;
}

export function generateProgram({ daysPerWeek, equipment, priorities = [], dislikedIds = [], experience = "intermediate" }, exerciseLibrary) {
  const split = SPLITS[daysPerWeek] || SPLITS[3];
  const equipmentFiltered = exerciseLibrary.filter((e) => e.equipment_type === equipment || equipment === "custom" || e.equipment_type === "bodyweight");
  const library = equipmentFiltered.length >= 8 ? equipmentFiltered : exerciseLibrary; // fall back if the filter is too narrow

  const setsForExperience = experience === "beginner" ? 2 : experience === "advanced" ? 4 : 3;

  const days = split.map((day) => {
    const exercises = pickExercisesForDay(day.muscles, library, { priorities, dislikedIds });
    return {
      label: day.label,
      exercises: exercises.map((ex) => ({
        exercise: ex,
        target_sets: ex.progression_method === "reverse_pyramid" ? 3 : setsForExperience,
        target_reps_low: ex.rep_range_low,
        target_reps_high: ex.rep_range_high,
        rest_seconds: ex.rest_seconds,
      })),
    };
  });

  return {
    splitName: split.map((d) => d.label).join(" / "),
    daysPerWeek,
    blockLengthWeeks: 9,
    days,
    reasons: buildReasons({ daysPerWeek, priorities }),
  };
}

function buildReasons({ daysPerWeek, priorities }) {
  const reasons = [
    { title: `${daysPerWeek} training days`, body: "Allows hard training with sufficient recovery between sessions." },
    { title: "Stable exercises", body: "Exercises stay consistent through the training block so progressive overload can actually be measured." },
    { title: "Balanced movement patterns", body: "The program includes pressing, pulling, and both knee- and hip-dominant lower body work." },
    { title: "Progressive overload", body: "EZfit builds every session's targets from your last comparable performance automatically." },
  ];
  if (priorities.length) {
    reasons.splice(1, 0, { title: `Prioritizing ${priorities.join(", ")}`, body: "Extra volume added within sensible limits — the program stays balanced overall." });
  }
  return reasons;
}
PASTE_EOF

cat > src/components/AvatarLink.jsx <<'PASTE_EOF'
import { Link } from "react-router-dom";
import { useProfile } from "../hooks/useProfile";

// Small avatar in the top-right that opens Profile/Settings — replaces the
// old bottom-nav Profile tab (Coach spec section 1: "Move account/settings
// access to the user avatar in the top-right corner rather than consuming a
// primary navigation tab").
export default function AvatarLink() {
  const { profile } = useProfile();
  return (
    <Link
      to="/profile"
      style={{
        width: 34, height: 34, borderRadius: "50%", background: "var(--primary-tint)", color: "var(--primary-ink)",
        display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
        fontFamily: "var(--font-display)", textDecoration: "none", flexShrink: 0, fontSize: 14,
      }}
    >
      {(profile?.display_name || "?")[0]}
    </Link>
  );
}
PASTE_EOF

cat > src/pages/coach/CoachHome.jsx <<'PASTE_EOF'
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import BottomNav from "../../components/BottomNav";
import { Card } from "../../components/Card";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth";
import { useProfile } from "../../hooks/useProfile";
import { STATE_META } from "../../lib/coachStates";

// Coach spec sections 2 and 36. "Measure -> Interpret -> Recommend -> User
// Approves -> Execute" — this page is the Interpret + Recommend surface;
// weekly-review.js (the scheduled function) does the Measure step.
export default function CoachHome() {
  const { user } = useAuth();
  const { profile, targets } = useProfile();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState([]);
  const [review, setReview] = useState(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: assignments } = await supabase
        .from("workout_day_assignments")
        .select("*, workout_templates(name)")
        .eq("user_id", user.id);
      setTemplates(assignments ?? []);

      const { data: latestReview } = await supabase
        .from("weekly_reviews")
        .select("*")
        .eq("user_id", user.id)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      setReview(latestReview);
    })();
  }, [user]);

  const nextReview = () => {
    const d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
    return d;
  };

  const daysUntilReview = Math.ceil((nextReview() - new Date()) / 86400000);
  const meta = review ? STATE_META[review.decision_state] : null;
  const uniqueTemplates = [...new Map(templates.map((t) => [t.template_id, t])).values()];

  const askEZfit = async (q) => {
    setAsking(true);
    setAnswer(null);
    setQuestion(q);
    try {
      const res = await fetch("/.netlify/functions/coach-ask", {
        method: "POST",
        body: JSON.stringify({ question: q, context: { profile: { goal: profile?.goal }, targets, review } }),
      });
      const json = await res.json();
      setAnswer(json.answer);
    } catch {
      setAnswer("EZfit couldn't reach the Coach explainer right now.");
    }
    setAsking(false);
  };

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
        </p>

        <Card style={{ background: meta ? `var(--${meta.tone === "green" ? "success" : meta.tone === "amber" ? "warning" : meta.tone === "gray" ? "surface-2" : "primary"}-tint)` : "var(--surface)" }}>
          {review ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{meta.emoji} {meta.label.toUpperCase()}</div>
              <p style={{ fontWeight: 600, margin: "2px 0 6px" }}>{review.recommendation_text}</p>
              <button className="btnGhost" style={{ padding: "8px 12px", width: "auto" }} onClick={() => setShowEvidence(!showEvidence)}>
                {showEvidence ? "Hide evidence" : "Why?"}
              </button>
              {showEvidence && review.evidence && (
                <div style={{ marginTop: 10 }}>
                  {review.evidence.map((e, i) => (
                    <div className="row" key={i} style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                      <span className="muted">{e.label}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{e.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="muted">No weekly review yet — one generates automatically after your first full week of data.</div>
          )}
        </Card>

        <Card onClick={() => navigate("/train")} style={{ cursor: "pointer" }}>
          <div className="eyebrow">Training</div>
          <p style={{ fontWeight: 700, fontSize: 15, margin: "2px 0" }}>{uniqueTemplates.map((t) => t.workout_templates?.name).join(" / ") || "No program yet"}</p>
          <div className="muted" style={{ fontSize: 12 }}>{templates.length} days/week</div>
        </Card>

        <Card onClick={() => navigate("/profile")} style={{ cursor: "pointer" }}>
          <div className="eyebrow">Nutrition</div>
          <p style={{ fontWeight: 700, fontSize: 15, margin: "2px 0" }}>{targets?.calories ?? "—"} kcal/day</p>
          <div className="muted" style={{ fontSize: 12 }}>{targets?.protein_g ?? "—"}g protein · {review?.calorie_adherence_pct ? `${review.calorie_adherence_pct}% adherence` : "No data yet"}</div>
        </Card>

        <Card tight>
          <div className="row"><span className="eyebrow" style={{ margin: 0 }}>Next review</span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{daysUntilReview} day{daysUntilReview === 1 ? "" : "s"}</span></div>
        </Card>

        {review?.insights?.length > 0 && (
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

        <button className="btnPrimary" onClick={() => navigate("/coach/builder")}>Build My Program</button>

        <div className="eyebrow" style={{ marginTop: 20 }}>Ask EZfit</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {["Why aren't we lowering my calories?", "Why did my bench target increase?", "Why doesn't today's weight matter?"].map((q) => (
            <button key={q} className="pill gray" style={{ cursor: "pointer", border: "none" }} onClick={() => askEZfit(q)}>{q}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about your plan…" style={{ flex: 1, padding: 13, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
          <button className="btnGhost" style={{ width: "auto", padding: "0 16px" }} onClick={() => askEZfit(question)} disabled={asking || !question}>Ask</button>
        </div>
        {asking && <div className="muted" style={{ marginTop: 8 }}>Thinking…</div>}
        {answer && <Card style={{ marginTop: 10 }}><div className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>{answer}</div></Card>}
      </div>
      <BottomNav />
    </>
  );
}
PASTE_EOF

cat > src/pages/coach/ProgramBuilder.jsx <<'PASTE_EOF'
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../components/Card";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth";
import { useProfile } from "../../hooks/useProfile";
import { generateProgram } from "../../lib/programGenerator";

const STEPS = ["goal", "experience", "frequency", "equipment", "priorities", "preview"];
const MUSCLES = ["chest", "back", "shoulders", "arms", "legs", "glutes", "core"];

// Guided program builder — Coach spec sections 4-11. Structured questions,
// not a blank chat, so EZfit gets reliable inputs (spec section 3). The
// preview step (11-12) shows the generated split plus "Why this program?"
// before anything is saved — user approves, per the Coach's core loop.
export default function ProgramBuilder() {
  const { user } = useAuth();
  const { saveProfile } = useProfile();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [library, setLibrary] = useState([]);
  const [form, setForm] = useState({ goal: "recomp", experience: "intermediate", daysPerWeek: 3, equipment: "full_gym", priorities: [] });
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("exercises").select("*").or(`is_global.eq.true,user_id.eq.${user.id}`);
      setLibrary(data ?? []);
    })();
  }, [user]);

  const togglePriority = (m) => {
    if (form.priorities.includes(m)) return setForm({ ...form, priorities: form.priorities.filter((p) => p !== m) });
    if (form.priorities.length >= 3) return;
    setForm({ ...form, priorities: [...form.priorities, m] });
  };

  const next = () => {
    if (STEPS[step] === "priorities") {
      const generated = generateProgram({ daysPerWeek: form.daysPerWeek, equipment: form.equipment, priorities: form.priorities, experience: form.experience }, library);
      setPreview(generated);
    }
    setStep(Math.min(STEPS.length - 1, step + 1));
  };

  const startProgram = async () => {
    setSaving(true);
    await saveProfile({ training_experience: form.experience, equipment: form.equipment, training_priorities: form.priorities, goal: form.goal });

    // Clear any existing day assignments so the new program fully replaces the old one.
    await supabase.from("workout_day_assignments").delete().eq("user_id", user.id);

    const dayOfWeekForIndex = (i) => {
      // Spread across the week starting Monday, skipping a rest day between sessions where possible.
      const patterns = { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
      return (patterns[form.daysPerWeek] || patterns[3])[i];
    };

    for (let i = 0; i < preview.days.length; i++) {
      const day = preview.days[i];
      const { data: template } = await supabase.from("workout_templates").insert({ user_id: user.id, name: day.label }).select().single();
      await supabase.from("workout_template_exercises").insert(
        day.exercises.map((e, idx) => ({
          template_id: template.id,
          exercise_id: e.exercise.id,
          order_index: idx,
          target_sets: e.target_sets,
          target_reps_low: e.target_reps_low,
          target_reps_high: e.target_reps_high,
          rest_seconds: e.rest_seconds,
        }))
      );
      await supabase.from("workout_day_assignments").upsert(
        { user_id: user.id, day_of_week: dayOfWeekForIndex(i), template_id: template.id },
        { onConflict: "user_id,day_of_week" }
      );
    }
    setSaving(false);
    navigate("/train");
  };

  const current = STEPS[step];

  return (
    <div className="content">
      {current === "goal" && (
        <>
          <h1 className="pageTitle" style={{ fontSize: 22 }}>What are you training for?</h1>
          {[["recomp", "Body Recomposition", "Lose fat while building or maintaining muscle."], ["build_muscle", "Build Muscle", "Prioritize muscle and strength gain."], ["lose_fat", "Lose Fat", "Prioritize fat loss while preserving muscle."], ["maintain", "Maintain", "Maintain current body composition and performance."]].map(([val, label, desc]) => (
            <div key={val} className="card cardTight" style={{ cursor: "pointer", borderColor: form.goal === val ? "var(--primary)" : "var(--border)", background: form.goal === val ? "var(--primary-tint)" : "var(--surface)" }} onClick={() => setForm({ ...form, goal: val })}>
              <div style={{ fontWeight: 600 }}>{label}</div><div className="muted" style={{ fontSize: 12 }}>{desc}</div>
            </div>
          ))}
          <button className="btnPrimary" onClick={next}>Continue</button>
        </>
      )}

      {current === "experience" && (
        <>
          <h1 className="pageTitle" style={{ fontSize: 22 }}>What's your training experience?</h1>
          {[["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]].map(([val, label]) => (
            <div key={val} className="card cardTight" style={{ cursor: "pointer", borderColor: form.experience === val ? "var(--primary)" : "var(--border)", background: form.experience === val ? "var(--primary-tint)" : "var(--surface)" }} onClick={() => setForm({ ...form, experience: val })}>
              <div style={{ fontWeight: 600 }}>{label}</div>
            </div>
          ))}
          <button className="btnPrimary" onClick={next}>Continue</button>
        </>
      )}

      {current === "frequency" && (
        <>
          <h1 className="pageTitle" style={{ fontSize: 22 }}>How often can you realistically train?</h1>
          {[2, 3, 4, 5].map((n) => (
            <div key={n} className="card cardTight" style={{ cursor: "pointer", borderColor: form.daysPerWeek === n ? "var(--primary)" : "var(--border)", background: form.daysPerWeek === n ? "var(--primary-tint)" : "var(--surface)" }} onClick={() => setForm({ ...form, daysPerWeek: n })}>
              <div style={{ fontWeight: 600 }}>{n} days {n === 3 && <span className="pill blue" style={{ marginLeft: 6 }}>Recommended</span>}</div>
            </div>
          ))}
          <button className="btnPrimary" onClick={next}>Continue</button>
        </>
      )}

      {current === "equipment" && (
        <>
          <h1 className="pageTitle" style={{ fontSize: 22 }}>Where do you train?</h1>
          {[["full_gym", "Full Gym"], ["home_gym", "Home Gym"], ["dumbbells_only", "Dumbbells Only"], ["custom", "Custom Equipment"]].map(([val, label]) => (
            <div key={val} className="card cardTight" style={{ cursor: "pointer", borderColor: form.equipment === val ? "var(--primary)" : "var(--border)", background: form.equipment === val ? "var(--primary-tint)" : "var(--surface)" }} onClick={() => setForm({ ...form, equipment: val })}>
              <div style={{ fontWeight: 600 }}>{label}</div>
            </div>
          ))}
          <button className="btnPrimary" onClick={next}>Continue</button>
        </>
      )}

      {current === "priorities" && (
        <>
          <h1 className="pageTitle" style={{ fontSize: 22 }}>What do you want to prioritize?</h1>
          <p className="muted">Pick up to three.</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
            {MUSCLES.map((m) => (
              <button key={m} onClick={() => togglePriority(m)} style={{ padding: "8px 14px", borderRadius: 10, border: form.priorities.includes(m) ? "1.5px solid var(--primary)" : "1px solid var(--border)", background: form.priorities.includes(m) ? "var(--primary-tint)" : "var(--surface)", cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>
                {m}
              </button>
            ))}
          </div>
          <button className="btnPrimary" onClick={next}>Build my program</button>
        </>
      )}

      {current === "preview" && preview && (
        <>
          <div className="eyebrow">Your EZfit program</div>
          <h1 className="pageTitle" style={{ fontSize: 22 }}>{preview.splitName}</h1>
          <p className="muted">{preview.daysPerWeek} days/week · Training block: {preview.blockLengthWeeks} weeks</p>

          {preview.days.map((day, i) => (
            <Card key={i}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{day.label}</div>
              {day.exercises.map((e, j) => (
                <div key={j} className="row" style={{ padding: "6px 0", borderTop: j > 0 ? "1px solid var(--border)" : "none" }}>
                  <span style={{ fontSize: 13.5 }}>{e.exercise.name}</span>
                  <span className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{e.target_sets} × {e.target_reps_low}–{e.target_reps_high}</span>
                </div>
              ))}
            </Card>
          ))}

          <Card>
            <div className="eyebrow">Why this program?</div>
            {preview.reasons.map((r, i) => (
              <div key={i} style={{ marginTop: i === 0 ? 6 : 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>{r.title}</div>
                <div className="muted" style={{ fontSize: 13 }}>{r.body}</div>
              </div>
            ))}
          </Card>

          <button className="btnPrimary" disabled={saving} onClick={startProgram}>{saving ? "Saving…" : "Start this program"}</button>
          <button className="btnGhost" style={{ marginTop: 8 }} onClick={() => navigate("/train/builder")}>Customize manually instead</button>
        </>
      )}
    </div>
  );
}
PASTE_EOF

cat > netlify/functions/coach-ask.js <<'PASTE_EOF'
// Netlify function — POST { question, context } -> { answer }.
// Backs "Ask EZfit" (spec section 33). This is deliberately NOT a general
// chatbot: the system prompt restricts it to explaining data the structured
// decision engine already produced (passed in as `context`). It cannot
// recommend calorie or program changes on its own — the engine in
// decisionEngine.js remains the only source of truth for that, per spec
// section 34 rule 6 ("do not automatically change calories without user
// approval") and the broader "structured engine remains the source of
// truth" principle.
const SYSTEM_PROMPT = `You are EZfit's Coach explainer. You are given a JSON snapshot of a
user's current weekly review, decision state, and plan. Your only job is to explain, in plain
calm language (2-4 sentences), WHY the numbers in that snapshot led to the decision shown.
Rules:
- Never propose a different calorie target, program change, or exercise swap than what's in
  the snapshot. You explain the existing decision; you do not make new ones.
- Never diagnose medical conditions, injuries, or eating disorders.
- Do not treat step/calorie-burn estimates as exact — describe them as estimates if referenced.
- If asked something the snapshot doesn't cover, say plainly that EZfit doesn't have that data
  yet rather than guessing.
- Tone: calm, evidence-driven, confident — like a good coach, not a chatbot hedging.`;

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  try {
    const { question, context } = JSON.parse(event.body);
    if (!question) return { statusCode: 400, body: JSON.stringify({ error: "question is required" }) };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Snapshot:\n${JSON.stringify(context)}\n\nQuestion: ${question}` }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return { statusCode: 502, body: JSON.stringify({ error: "Upstream error", detail }) };
    }

    const data = await response.json();
    const answer = data.content.find((b) => b.type === "text")?.text ?? "EZfit couldn't generate an answer.";
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
PASTE_EOF

cat > src/lib/decisionEngine.js <<'PASTE_EOF'
// Weekly / Coach decision engine — spec section 43 (original weekly review)
// extended by the Coach spec (sections 16-30) with a sixth state, an
// adherence-first gate, and a minimum-data guard. Never mutates the plan
// itself; only returns a recommendation the UI must confirm with the user.

const CALORIE_ADHERENCE_BAND = 0.1; // within 10% of target counts as adherent
const STALL_WEEKS = 2;

// Spec section 26: don't produce a confident recommendation without enough
// evidence. Returns a list of what's missing so the UI can say exactly what
// to log next, rather than a vague "come back later."
export function checkDataSufficiency({ weighInsThisWeek, waistLogsThisWeek, comparableWorkouts }) {
  const missing = [];
  if (weighInsThisWeek < 3) missing.push(`${3 - weighInsThisWeek} more morning weigh-ins needed`);
  if (waistLogsThisWeek < 1) missing.push("Log this week's waist measurement");
  if (comparableWorkouts < 1) missing.push("Complete another comparable workout");
  return { sufficient: missing.length === 0, missing };
}

export function evaluateWeek({
  avgCalories,
  calorieTarget,
  weightTrend,       // 'down' | 'flat' | 'up'
  waistTrend,        // 'down' | 'flat' | 'up'
  strengthTrend,      // 'improving' | 'flat' | 'declining'
  weeksSinceMovement,
  weightLossRatePctPerWeek,
  dataSufficiency,     // result of checkDataSufficiency(), optional
}) {
  if (dataSufficiency && !dataSufficiency.sufficient) {
    return {
      state: "gray",
      title: "Need more data",
      message: dataSufficiency.missing.join(" · "),
      recommendation: "EZfit won't change your plan without enough evidence.",
      calorieChange: 0,
    };
  }

  const adherencePct = calorieTarget ? avgCalories / calorieTarget : 1;
  const isAdherent = Math.abs(1 - adherencePct) <= CALORIE_ADHERENCE_BAND;

  // STEP 1 (spec sec 18): check adherence before anything else.
  if (!isAdherent && avgCalories > calorieTarget) {
    return {
      state: "orange",
      title: "Adherence first",
      message: `Target ${calorieTarget} kcal, actual average ${Math.round(avgCalories)} kcal.`,
      recommendation: "Hit your existing calorie target before reducing calories further.",
      calorieChange: 0,
    };
  }

  if (weightTrend === "down" && weightLossRatePctPerWeek > 1 && strengthTrend === "declining") {
    return {
      state: "blue",
      title: "Consider more fuel",
      message: "Weight-loss rate is aggressive and gym performance has declined across multiple comparable sessions.",
      recommendation: "Increase calories by 100–150/day.",
      calorieChange: 125,
    };
  }

  if (weightTrend === "flat" && waistTrend === "flat" && weeksSinceMovement >= STALL_WEEKS && isAdherent) {
    return {
      state: "purple",
      title: "Small adjustment",
      message: "Weight and waist have remained unchanged for multiple weeks despite strong adherence.",
      recommendation: "Reduce calories by approximately 100–150/day.",
      calorieChange: -125,
    };
  }

  // Ambiguous: weight up, strength up, waist stable — spec section 25.
  if (weightTrend === "up" && strengthTrend === "improving" && waistTrend === "flat") {
    return {
      state: "yellow",
      title: "Watching",
      message: "Body weight and strength are increasing while waist remains stable.",
      recommendation: "Not enough evidence to change calories yet — collect another week of data.",
      calorieChange: 0,
    };
  }

  if (weightTrend === "up" && waistTrend === "up" && isAdherent) {
    return {
      state: "purple",
      title: "Reduce intake",
      message: "Weight and waist are both trending up with strong adherence.",
      recommendation: "Reduce calories by approximately 100–200/day.",
      calorieChange: -150,
    };
  }

  if ((weightTrend === "down" || (weightTrend === "flat" && waistTrend === "down")) && (strengthTrend === "improving" || strengthTrend === "flat")) {
    return {
      state: "green",
      title: "Keep going",
      message: "You're getting leaner while gym performance holds or improves.",
      recommendation: "No changes needed.",
      calorieChange: 0,
    };
  }

  return {
    state: "yellow",
    title: "Watching",
    message: "Progress has slowed, but there isn't enough evidence to change the plan.",
    recommendation: "Collect another week of data.",
    calorieChange: 0,
  };
}

// Spec section 45 / 24 — weight fluctuation protection: compare a single
// day's weight against the 7-day trend, not the previous day, so normal
// water-weight swings never trigger a false signal.
export function isNormalFluctuation(dailyWeight, sevenDayAverage, thresholdLb = 3) {
  return Math.abs(dailyWeight - sevenDayAverage) <= thresholdLb;
}

// Builds the evidence list + up-to-three insights shown in the Coach's
// "Why?" panel (spec sections 29 and 32).
export function buildEvidence({ weightChangeLb, waistChangeIn, strengthTrend, calorieAdherencePct, trainingAdherencePct }) {
  return [
    { label: "Weight trend", value: `${weightChangeLb > 0 ? "+" : ""}${weightChangeLb} lb` },
    { label: "Waist", value: `${waistChangeIn > 0 ? "+" : ""}${waistChangeIn}"` },
    { label: "Strength", value: strengthTrend === "improving" ? "↑ Improving" : strengthTrend === "declining" ? "↓ Declining" : "→ Stable" },
    { label: "Nutrition adherence", value: `${calorieAdherencePct}%` },
    { label: "Training adherence", value: `${trainingAdherencePct}%` },
  ];
}

export function buildInsights({ prCount, workoutsCompleted, calorieDeltaFromTarget, sleepDeltaMinutes }) {
  const insights = [];
  if (prCount > 0 && workoutsCompleted > 0) {
    insights.push({ label: "Training", body: `You hit ${prCount} PR${prCount === 1 ? "" : "s"} across ${workoutsCompleted} workout${workoutsCompleted === 1 ? "" : "s"}.` });
  }
  if (calorieDeltaFromTarget != null) {
    insights.push({ label: "Nutrition", body: `You averaged ${Math.abs(Math.round(calorieDeltaFromTarget))} calories ${calorieDeltaFromTarget >= 0 ? "above" : "below"} your target.` });
  }
  if (sleepDeltaMinutes != null && Math.abs(sleepDeltaMinutes) >= 15) {
    insights.push({ label: "Recovery", body: `Average sleep ${sleepDeltaMinutes < 0 ? "decreased" : "increased"} by ${Math.abs(Math.round(sleepDeltaMinutes))} minutes.` });
  }
  return insights.slice(0, 3);
}
PASTE_EOF

cat > src/components/BottomNav.jsx <<'PASTE_EOF'
import { NavLink } from "react-router-dom";

const ICONS = {
  Today: "M4 11.5 12 4l8 7.5M6 10v9h12v-9",
  Train: "M12,4a8,8 0 1,0 0.001,0 M12 8v4l3 2",
  Food: "M6 3v8a3 3 0 0 0 3 3v7M6 3v6M8 3v6M4 3v6M17 3c-2 1-2.5 4-2.5 6 0 2 1 3 2.5 3v9",
  Coach: "M12 3l2.2 4.6 5 .7-3.6 3.6.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.6 5-.7z",
  Progress: "M4 19V9M11 19V5M18 19v-7",
};

// Coach spec section 1: Today · Train · Food · Coach · Progress. Profile
// moved to the top-right avatar (see AvatarLink) rather than a nav tab.
export default function BottomNav() {
  const items = [
    ["/today", "Today"],
    ["/train", "Train"],
    ["/food", "Food"],
    ["/coach", "Coach"],
    ["/progress", "Progress"],
  ];
  return (
    <nav className="bottomnav">
      {items.map(([path, label]) => (
        <NavLink key={path} to={path} className={({ isActive }) => `navitem${isActive ? " active" : ""}`}>
          <svg width="21" height="21" viewBox="0 0 24 24">
            <path d={ICONS[label]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
PASTE_EOF

cat > src/App.jsx <<'PASTE_EOF'
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { useProfile } from "./hooks/useProfile";

import SignIn from "./pages/SignIn";
import Onboarding from "./pages/onboarding/Onboarding";
import Today from "./pages/Today";
import Train from "./pages/Train";
import TrainDay from "./pages/TrainDay";
import TrainActive from "./pages/TrainActive";
import TrainComplete from "./pages/TrainComplete";
import WorkoutBuilder from "./pages/WorkoutBuilder";
import Food from "./pages/Food";
import FoodAdd from "./pages/FoodAdd";
import Progress from "./pages/Progress";
import Profile from "./pages/Profile";
import CoachHome from "./pages/coach/CoachHome";
import ProgramBuilder from "./pages/coach/ProgramBuilder";

function Gate({ children }) {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  if (loading || (user && profileLoading)) {
    return <div className="app"><div className="content">Loading…</div></div>;
  }
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!profile?.onboarded) return <Navigate to="/onboarding" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/today" element={<Gate><Today /></Gate>} />
          <Route path="/train" element={<Gate><Train /></Gate>} />
          <Route path="/train/builder" element={<Gate><WorkoutBuilder /></Gate>} />
          <Route path="/train/day/:date" element={<Gate><TrainDay /></Gate>} />
          <Route path="/train/active" element={<Gate><TrainActive /></Gate>} />
          <Route path="/train/complete" element={<Gate><TrainComplete /></Gate>} />
          <Route path="/food" element={<Gate><Food /></Gate>} />
          <Route path="/food/add" element={<Gate><FoodAdd /></Gate>} />
          <Route path="/progress" element={<Gate><Progress /></Gate>} />
          <Route path="/profile" element={<Gate><Profile /></Gate>} />
          <Route path="/coach" element={<Gate><CoachHome /></Gate>} />
          <Route path="/coach/builder" element={<Gate><ProgramBuilder /></Gate>} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
PASTE_EOF

cat > src/pages/Profile.jsx <<'PASTE_EOF'
import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { useProfile } from "../hooks/useProfile";
import { useAuth } from "../lib/auth";

// Reached via the avatar (see AvatarLink) rather than a bottom-nav tab —
// Coach spec section 1 moves account/settings off the primary nav.
export default function Profile() {
  const { profile, targets } = useProfile();
  const { signOut } = useAuth();

  return (
    <div className="content">
      <Link to="/today" style={{ display: "inline-block", marginBottom: 10, color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}>&larr; Back</Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 16px" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--primary-tint)", color: "var(--primary-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "var(--font-display)" }}>
          {(profile?.display_name || "?")[0]}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{profile?.display_name}</div>
          <div className="muted" style={{ fontSize: 12, textTransform: "capitalize" }}>{profile?.goal?.replace("_", " ")}</div>
        </div>
      </div>
      <Card>
        <div className="eyebrow">Nutrition targets</div>
        <div className="row"><span className="muted">Calories</span><span style={{ fontFamily: "var(--font-mono)" }}>{targets?.calories} kcal</span></div>
        <div className="row"><span className="muted">Protein</span><span style={{ fontFamily: "var(--font-mono)" }}>{targets?.protein_g}g</span></div>
        <div className="row"><span className="muted">Carbs</span><span style={{ fontFamily: "var(--font-mono)" }}>{targets?.carbs_g}g</span></div>
        <div className="row"><span className="muted">Fat</span><span style={{ fontFamily: "var(--font-mono)" }}>{targets?.fat_g}g</span></div>
      </Card>
      <Card tight><div className="row"><span className="muted">Daily step goal</span><span>{profile?.step_goal}</span></div></Card>
      <Card tight><div className="row"><span className="muted">Training days / week</span><span>{profile?.training_days_per_week}</span></div></Card>
      <Card tight><div className="row"><span className="muted">Training experience</span><span style={{ textTransform: "capitalize" }}>{profile?.training_experience ?? "—"}</span></div></Card>
      <Card tight><div className="row"><span className="muted">Equipment</span><span style={{ textTransform: "capitalize" }}>{profile?.equipment?.replace("_", " ") ?? "—"}</span></div></Card>
      <button className="btnGhost" onClick={signOut}>Sign out</button>
    </div>
  );
}
PASTE_EOF

cat > src/pages/Today.jsx <<'PASTE_EOF'
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toISODate } from "../lib/dateUtils";
import BottomNav from "../components/BottomNav";
import AvatarLink from "../components/AvatarLink";
import { Card, Pill } from "../components/Card";
import { useTodayData } from "../hooks/useTodayData";
import { useProfile } from "../hooks/useProfile";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { remaining, pct, dailyScore } from "../lib/nutritionMath";

export default function Today() {
  const { user } = useAuth();
  const { profile, targets } = useProfile();
  const { bodyMetric, recovery, macroTotals, todaysSession, loading, reload } = useTodayData();
  const navigate = useNavigate();
  const [weightInput, setWeightInput] = useState("");

  const logWeight = async () => {
    if (!weightInput) return;
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("body_metrics").upsert({ user_id: user.id, metric_date: today, weight_lb: Number(weightInput) });
    setWeightInput("");
    reload();
  };

  if (loading) return <div className="content">Loading today…</div>;

  const calTarget = targets?.calories ?? 2200;
  const proteinTarget = targets?.protein_g ?? 180;
  const calRemaining = remaining(calTarget, macroTotals.calories);
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
          <div style={{ display: "flex", gap: 22 }}>
            <div style={{ flex: 1 }}>
              <div className="eyebrow">Today's weight</div>
              {bodyMetric?.weight_lb ? (
                <div className="bigNum" style={{ fontSize: 26 }}>{bodyMetric.weight_lb} <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-muted)" }}>lb</span></div>
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input placeholder="lb" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} style={{ width: 70, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
                  <button className="btnGhost" style={{ width: "auto", padding: "8px 12px" }} onClick={logWeight}>Log</button>
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div className="eyebrow">Sleep</div>
              <div className="bigNum" style={{ fontSize: 26 }}>
                {recovery?.sleep_minutes ? `${Math.floor(recovery.sleep_minutes / 60)}h ${recovery.sleep_minutes % 60}m` : "—"}
              </div>
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
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="eyebrow" style={{ margin: 0 }}>Food</span>
            <Pill tone="blue">{calRemaining} kcal left</Pill>
          </div>
          <div className="row" style={{ alignItems: "baseline" }}>
            <span className="bigNum" style={{ fontSize: 22 }}>{Math.round(macroTotals.calories)}</span>
            <span className="muted">/ {calTarget} kcal</span>
          </div>
          <div className="progressTrack" style={{ margin: "8px 0 4px" }}>
            <div className="progressFill" style={{ width: `${pct(macroTotals.calories, calTarget)}%` }} />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{proteinRemaining}g protein remaining</div>
          <button className="btnGhost" style={{ marginTop: 12 }} onClick={() => navigate("/food/add")}>Add food</button>
        </Card>

        <Card>
          <div className="row"><span className="eyebrow" style={{ margin: 0 }}>Steps</span><span className="muted" style={{ fontFamily: "var(--font-mono)" }}>{steps} / {stepGoal}</span></div>
          <div className="progressTrack" style={{ marginTop: 8 }}><div className="progressFill" style={{ width: `${pct(steps, stepGoal)}%`, background: "var(--success)" }} /></div>
        </Card>

        <Card>
          <div className="eyebrow" style={{ margin: 0 }}>Today's score</div>
          <div className="bigNum" style={{ fontSize: 30 }}>{score}<span style={{ fontSize: 15, color: "var(--text-muted)", fontWeight: 500 }}>/100</span></div>
        </Card>
      </div>
      <BottomNav />
    </>
  );
}
PASTE_EOF

cat > src/pages/Train.jsx <<'PASTE_EOF'
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import AvatarLink from "../components/AvatarLink";
import { Card, Pill } from "../components/Card";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { getWeekDates, toISODate, dayLabel } from "../lib/dateUtils";

// Week view: seven days, each showing its assigned template name (or Rest,
// or "+ Build" if nothing's assigned to that weekday yet). Tapping a day
// with a workout goes to the full-screen hold-to-start view for that date.
export default function Train() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [templates, setTemplates] = useState({});
  const [completedDates, setCompletedDates] = useState(new Set());

  const week = getWeekDates();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: a } = await supabase.from("workout_day_assignments").select("*, workout_templates(name)").eq("user_id", user.id);
      setAssignments(a ?? []);
      const map = {};
      (a ?? []).forEach((row) => { map[row.day_of_week] = row; });
      setTemplates(map);

      const { data: sessions } = await supabase
        .from("workout_sessions")
        .select("session_date")
        .eq("user_id", user.id)
        .eq("status", "complete")
        .gte("session_date", toISODate(week[0]))
        .lte("session_date", toISODate(week[6]));
      setCompletedDates(new Set((sessions ?? []).map((s) => s.session_date)));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <>
      <div className="content">
        <div className="row">
          <h1 className="pageTitle">Train</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btnGhost" style={{ width: "auto", padding: "8px 14px", fontSize: 12.5 }} onClick={() => navigate("/train/builder")}>
              + Build workout
            </button>
            <AvatarLink />
          </div>
        </div>
        <p className="muted">What do you need to beat today?</p>

        {week.map((d) => {
          const iso = toISODate(d);
          const isToday = iso === toISODate(new Date());
          const assignment = templates[d.getDay()];
          const done = completedDates.has(iso);
          return (
            <Card
              key={iso}
              tight
              onClick={() => assignment && navigate(`/train/day/${iso}`)}
              style={{
                cursor: assignment ? "pointer" : "default",
                borderColor: isToday ? "var(--primary)" : "var(--border)",
                background: isToday ? "var(--primary-tint)" : "var(--surface)",
              }}
            >
              <div className="row">
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{dayLabel(d)} {d.getDate()}</div>
                  <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: 2 }}>{assignment ? assignment.workout_templates?.name : "Rest day"}</div>
                </div>
                {done ? <Pill tone="green">Done</Pill> : assignment ? <Pill tone="blue">{isToday ? "Today" : "Scheduled"}</Pill> : <Pill tone="gray">—</Pill>}
              </div>
            </Card>
          );
        })}

        {assignments.length === 0 && (
          <Card>
            <div className="muted">No workouts built yet. Tap "+ Build workout" to create your first one and assign it to training days.</div>
          </Card>
        )}
      </div>
      <BottomNav />
    </>
  );
}
PASTE_EOF

cat > src/pages/Food.jsx <<'PASTE_EOF'
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import AvatarLink from "../components/AvatarLink";
import { Card } from "../components/Card";
import MacroBar from "../components/MacroBar";
import { useWeekFood } from "../hooks/useWeekFood";
import { useProfile } from "../hooks/useProfile";
import { pct } from "../lib/nutritionMath";
import { toISODate, dayLabel, HOUR_SLOTS, formatHourSlot, slotKey } from "../lib/dateUtils";

// MacroFactor-style layout: a 7-day strip you toggle across the top, an hourly
// 5am-12am timeline underneath for the selected day (spec request), rather
// than the old breakfast/lunch/dinner/snacks buckets.
export default function Food() {
  const { targets } = useProfile();
  const { week, mealsByDate, totalsForDate, loading, reload } = useWeekFood();
  const [selected, setSelected] = useState(toISODate(new Date()));
  const navigate = useNavigate();

  if (loading) return <div className="content">Loading…</div>;

  const calTarget = targets?.calories ?? 2200;
  const dayMeals = mealsByDate[selected] ?? [];
  const totals = totalsForDate(selected);

  const itemsForHour = (hour) => {
    const key = slotKey(hour);
    return dayMeals.filter((m) => (m.logged_time ?? "").slice(0, 2) === key.slice(0, 2)).flatMap((m) => m.meal_items ?? []);
  };

  return (
    <>
      <div className="content">
        <div className="row"><h1 className="pageTitle">Food</h1><AvatarLink /></div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
          {week.map((d) => {
            const iso = toISODate(d);
            const dayTotals = totalsForDate(iso);
            const isSelected = iso === selected;
            const onTarget = calTarget ? Math.abs(dayTotals.calories - calTarget) / calTarget < 0.1 : false;
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                style={{
                  flex: "1 0 auto",
                  minWidth: 44,
                  padding: "8px 4px",
                  borderRadius: 12,
                  border: isSelected ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                  background: isSelected ? "var(--primary-tint)" : "var(--surface)",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{dayLabel(d)}</div>
                <div style={{ fontWeight: 700, fontSize: 14, margin: "2px 0" }}>{d.getDate()}</div>
                <div style={{ width: 5, height: 5, borderRadius: "50%", margin: "0 auto", background: dayTotals.calories === 0 ? "var(--border)" : onTarget ? "var(--success)" : "var(--warning)" }} />
              </button>
            );
          })}
        </div>

        <Card>
          <div className="row" style={{ alignItems: "baseline" }}>
            <span className="bigNum" style={{ fontSize: 26 }}>{Math.round(totals.calories)}</span>
            <span className="muted">/ {calTarget} kcal</span>
          </div>
          <div className="progressTrack" style={{ margin: "8px 0 12px" }}>
            <div className="progressFill" style={{ width: `${pct(totals.calories, calTarget)}%` }} />
          </div>
          <MacroBar label="Protein" current={totals.protein_g} target={targets?.protein_g ?? 180} color="var(--protein)" />
          <MacroBar label="Carbs" current={totals.carbs_g} target={targets?.carbs_g ?? 200} color="var(--carbs)" />
          <MacroBar label="Fat" current={totals.fat_g} target={targets?.fat_g ?? 70} color="var(--fat)" />
        </Card>

        <div className="eyebrow" style={{ marginTop: 4 }}>Timeline</div>
        {HOUR_SLOTS.map((hour) => {
          const items = itemsForHour(hour);
          return (
            <div key={hour} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 52, flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", paddingTop: 12 }}>
                {formatHourSlot(hour)}
              </div>
              <div style={{ flex: 1 }}>
                {items.length === 0 ? (
                  <button
                    onClick={() => navigate("/food/add", { state: { date: selected, hour: slotKey(hour) } })}
                    style={{ width: "100%", textAlign: "left", background: "none", border: "1px dashed var(--border)", borderRadius: 12, padding: "10px 12px", color: "var(--text-faint)", fontSize: 12.5, cursor: "pointer" }}
                  >
                    + Log food
                  </button>
                ) : (
                  <div className="card cardTight" style={{ cursor: "pointer" }} onClick={() => navigate("/food/add", { state: { date: selected, hour: slotKey(hour) } })}>
                    {items.map((it) => (
                      <div className="row" key={it.id} style={{ fontSize: 13 }}>
                        <span>{it.food?.name}</span>
                        <span className="muted">{Math.round((it.food?.calories ?? 0) * (it.food?.serving_qty ? it.quantity / it.food.serving_qty : 1))} kcal</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <BottomNav />
    </>
  );
}
PASTE_EOF

cat > src/pages/Progress.jsx <<'PASTE_EOF'
import { useEffect, useState } from "react";
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
      </div>
      <BottomNav />
    </>
  );
}
PASTE_EOF

cat > netlify/functions/weekly-review.js <<'PASTE_EOF'
// Netlify scheduled function — runs weekly. Uses the Supabase service-role
// key (server-side only) to read every user's last 7 days and write one
// weekly_reviews row per user, importing the exact same decision engine the
// client uses (src/lib/decisionEngine.js) so the rules can never drift
// between server and client — the Coach spec's core requirement.
import { createClient } from "@supabase/supabase-js";
import { evaluateWeek, checkDataSufficiency, buildEvidence, buildInsights } from "../../src/lib/decisionEngine.js";

function trend(values) {
  if (values.length < 2) return "flat";
  const delta = values[values.length - 1] - values[0];
  if (delta < -0.3) return "down";
  if (delta > 0.3) return "up";
  return "flat";
}

// Compares each exercise's average top-set weight this week vs the prior
// window. More exercises up than down -> improving, and vice versa.
function computeStrengthTrend(thisWeekSets, priorWeekSets) {
  const avgByExercise = (sets) => {
    const map = {};
    for (const s of sets) {
      map[s.exercise_id] = map[s.exercise_id] || [];
      map[s.exercise_id].push(s.actual_weight);
    }
    const out = {};
    for (const [ex, weights] of Object.entries(map)) out[ex] = weights.reduce((a, b) => a + b, 0) / weights.length;
    return out;
  };
  const thisAvg = avgByExercise(thisWeekSets);
  const priorAvg = avgByExercise(priorWeekSets);
  let up = 0, down = 0;
  for (const ex of Object.keys(thisAvg)) {
    if (priorAvg[ex] == null) continue;
    if (thisAvg[ex] > priorAvg[ex]) up++;
    else if (thisAvg[ex] < priorAvg[ex]) down++;
  }
  if (up === 0 && down === 0) return "flat";
  return up > down ? "improving" : down > up ? "declining" : "flat";
}

export async function handler() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const priorWeekStart = new Date(weekStart);
  priorWeekStart.setDate(priorWeekStart.getDate() - 7);
  const priorWeekStartStr = priorWeekStart.toISOString().slice(0, 10);

  const { data: profiles } = await supabase.from("profiles").select("id").eq("onboarded", true);

  for (const { id: userId } of profiles ?? []) {
    const [{ data: metrics }, { data: targets }, { data: sessions }, { data: meals }, { data: thisWeekSets }, { data: priorWeekSets }, { data: recovery }, { data: priorReview }] = await Promise.all([
      supabase.from("body_metrics").select("*").eq("user_id", userId).gte("metric_date", weekStartStr).order("metric_date"),
      supabase.from("nutrition_targets").select("*").eq("user_id", userId).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("workout_sessions").select("*").eq("user_id", userId).gte("session_date", weekStartStr),
      supabase.from("meals").select("*, meal_items(*, food:foods(calories,protein_g,serving_qty))").eq("user_id", userId).gte("meal_date", weekStartStr),
      supabase.from("sets").select("*").eq("user_id", userId).gte("completed_at", weekStartStr),
      supabase.from("sets").select("*").eq("user_id", userId).gte("completed_at", priorWeekStartStr).lt("completed_at", weekStartStr),
      supabase.from("recovery_logs").select("*").eq("user_id", userId).gte("log_date", weekStartStr),
      supabase.from("weekly_reviews").select("decision_state").eq("user_id", userId).order("week_start", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const weights = (metrics ?? []).filter((m) => m.weight_lb).map((m) => m.weight_lb);
    const waists = (metrics ?? []).filter((m) => m.waist_in).map((m) => m.waist_in);
    const avgWeight = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : null;
    const avgWaist = waists.length ? waists.reduce((a, b) => a + b, 0) / waists.length : null;

    const dailyCalories = {};
    const dailyProtein = {};
    for (const meal of meals ?? []) {
      const day = meal.meal_date;
      for (const item of meal.meal_items ?? []) {
        const factor = item.food?.serving_qty ? item.quantity / item.food.serving_qty : 1;
        dailyCalories[day] = (dailyCalories[day] || 0) + (item.food?.calories ?? 0) * factor;
        dailyProtein[day] = (dailyProtein[day] || 0) + (item.food?.protein_g ?? 0) * factor;
      }
    }
    const calorieVals = Object.values(dailyCalories);
    const avgCalories = calorieVals.length ? calorieVals.reduce((a, b) => a + b, 0) / calorieVals.length : 0;
    const proteinVals = Object.values(dailyProtein);
    const avgProtein = proteinVals.length ? proteinVals.reduce((a, b) => a + b, 0) / proteinVals.length : 0;

    const strengthTrend = computeStrengthTrend(thisWeekSets ?? [], priorWeekSets ?? []);
    const weightTrend = trend(weights);
    const waistTrend = trend(waists);

    const dataSufficiency = checkDataSufficiency({
      weighInsThisWeek: weights.length,
      waistLogsThisWeek: waists.length,
      comparableWorkouts: (sessions ?? []).filter((s) => s.status === "complete").length,
    });

    const wasFlatLastWeek = priorReview?.decision_state === "yellow" || priorReview?.decision_state === "purple";

    const decision = evaluateWeek({
      avgCalories,
      calorieTarget: targets?.calories ?? 2200,
      weightTrend,
      waistTrend,
      strengthTrend,
      weeksSinceMovement: weightTrend === "flat" && waistTrend === "flat" ? (wasFlatLastWeek ? 2 : 1) : 0,
      weightLossRatePctPerWeek: avgWeight && weights.length > 1 ? Math.abs((weights[weights.length - 1] - weights[0]) / weights[0]) * 100 : 0,
      dataSufficiency,
    });

    const calorieAdherencePct = targets?.calories ? Math.round(Math.min(100, 100 - (Math.abs(avgCalories - targets.calories) / targets.calories) * 100)) : null;
    const proteinAdherencePct = targets?.protein_g ? Math.round(Math.min(100, (avgProtein / targets.protein_g) * 100)) : null;
    const workoutsCompleted = (sessions ?? []).filter((s) => s.status === "complete").length;
    const prCount = (thisWeekSets ?? []).filter((s) => s.is_pr).length;
    const sleepVals = (recovery ?? []).filter((r) => r.sleep_minutes).map((r) => r.sleep_minutes);
    const avgSleep = sleepVals.length ? sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length : null;

    const evidence = buildEvidence({
      weightChangeLb: weights.length > 1 ? Math.round((weights[weights.length - 1] - weights[0]) * 10) / 10 : 0,
      waistChangeIn: waists.length > 1 ? Math.round((waists[waists.length - 1] - waists[0]) * 10) / 10 : 0,
      strengthTrend,
      calorieAdherencePct: calorieAdherencePct ?? 0,
      trainingAdherencePct: (sessions ?? []).length ? Math.round((workoutsCompleted / (sessions ?? []).length) * 100) : 0,
    });

    const insights = buildInsights({
      prCount,
      workoutsCompleted,
      calorieDeltaFromTarget: targets?.calories ? avgCalories - targets.calories : null,
      sleepDeltaMinutes: null, // needs a prior-week baseline; left for a future pass
    });

    await supabase.from("weekly_reviews").insert({
      user_id: userId,
      week_start: weekStartStr,
      avg_weight_lb: avgWeight,
      avg_waist_in: avgWaist,
      weight_trend: weightTrend,
      waist_trend: waistTrend,
      strength_trend: strengthTrend,
      workouts_completed: workoutsCompleted,
      workouts_scheduled: (sessions ?? []).length,
      prs_count: prCount,
      avg_calories: avgCalories,
      calorie_target: targets?.calories ?? 2200,
      calorie_adherence_pct: calorieAdherencePct,
      protein_adherence_pct: proteinAdherencePct,
      avg_steps: null,
      avg_sleep_minutes: avgSleep,
      decision_state: decision.state,
      recommendation_text: decision.message ? `${decision.message} ${decision.recommendation}` : decision.recommendation,
      recommended_calorie_change: decision.calorieChange,
      evidence,
      insights,
    });
  }

  return { statusCode: 200, body: JSON.stringify({ processed: (profiles ?? []).length }) };
}
PASTE_EOF

