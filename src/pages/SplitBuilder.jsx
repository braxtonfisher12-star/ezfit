import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/Card";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

const DAYS = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]];

export default function SplitBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [splitName, setSplitName] = useState("");
  const [templates, setTemplates] = useState([]);
  const [dayMap, setDayMap] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("workout_templates").select("*").eq("user_id", user.id).order("name");
      setTemplates(data ?? []);
    })();
  }, [user]);

  const setDay = (day, templateId) => setDayMap({ ...dayMap, [day]: templateId });

  const save = async () => {
    if (!splitName) return alert("Give the split a name.");
    setSaving(true);

    const { data: split, error: splitError } = await supabase
      .from("training_splits")
      .insert({ user_id: user.id, name: splitName, source: "manual" })
      .select()
      .single();
    if (splitError) {
      setSaving(false);
      return alert(`Couldn't save split: ${splitError.message}`);
    }

    await supabase.from("training_splits").update({ is_active: false }).eq("user_id", user.id).neq("id", split.id);

    await supabase.from("training_blocks").update({ is_active: false }).eq("user_id", user.id);
    await supabase.from("training_blocks").insert({ user_id: user.id, split_id: split.id, name: splitName, start_date: new Date().toISOString().slice(0, 10), length_weeks: 9 });

    for (const [day, templateId] of Object.entries(dayMap)) {
      if (!templateId || templateId === "rest") {
        await supabase.from("workout_day_assignments").delete().eq("user_id", user.id).eq("day_of_week", Number(day));
        continue;
      }
      const { error } = await supabase
        .from("workout_day_assignments")
        .upsert({ user_id: user.id, day_of_week: Number(day), template_id: templateId, split_id: split.id }, { onConflict: "user_id,day_of_week" });
      if (error) console.error("day assignment failed:", error);
    }

    setSaving(false);
    navigate("/train");
  };

  return (
    <div className="content">
      <button onClick={() => navigate("/train")} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 10 }}>&larr; Back</button>
      <h1 className="pageTitle" style={{ fontSize: 22 }}>Build a split</h1>
      <p className="muted">Assign an existing workout to each day, or leave it as rest.</p>
      <div className="field"><label>Split name</label><input value={splitName} onChange={(e) => setSplitName(e.target.value)} placeholder="Push Pull Legs" /></div>

      {templates.length === 0 && (
        <Card><div className="muted">You don't have any workouts built yet — go to My Workouts and build a few first, then come back to arrange them into a split.</div></Card>
      )}

      {DAYS.map(([day, label]) => (
        <div key={day} className="field">
          <label>{label}</label>
          <select value={dayMap[day] ?? "rest"} onChange={(e) => setDay(day, e.target.value)}>
            <option value="rest">Rest day</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      ))}

      <button className="btnPrimary" onClick={save} disabled={saving || templates.length === 0}>{saving ? "Saving…" : "Save split"}</button>
    </div>
  );
}
