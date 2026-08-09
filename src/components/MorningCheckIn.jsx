import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { useProfile } from "../hooks/useProfile";
import { toDisplayWeight, fromDisplayWeight, unitLabel } from "../lib/units";
import { toISODate } from "../lib/dateUtils";
import { randomMotivationalQuote } from "../lib/motivationalQuotes";

const STEPS = ["weight", "waist", "sleep", "energy", "quote"];
const ENERGY_LABELS = ["Drained", "Low", "Okay", "Good", "Great"];

export default function MorningCheckIn({ onDone }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [stepIndex, setStepIndex] = useState(0);
  const [weightInput, setWeightInput] = useState("");
  const [waistInput, setWaistInput] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [energy, setEnergy] = useState(null);
  const [saving, setSaving] = useState(false);
  const [quote] = useState(randomMotivationalQuote());

  const today = toISODate(new Date());
  const unit = profile?.weight_unit ?? "lb";

  const advance = () => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));

  const saveWeight = async () => {
    if (weightInput) {
      setSaving(true);
      const weightLb = fromDisplayWeight(weightInput, unit);
      await supabase.from("body_metrics").upsert({ user_id: user.id, metric_date: today, weight_lb: weightLb });
      setSaving(false);
    }
    advance();
  };

  const saveWaist = async () => {
    if (waistInput) {
      setSaving(true);
      await supabase.from("body_metrics").upsert({ user_id: user.id, metric_date: today, waist_in: Number(waistInput) });
      setSaving(false);
    }
    advance();
  };

  const saveSleep = async () => {
    if (sleepHours) {
      setSaving(true);
      const minutes = Math.round(Number(sleepHours) * 60);
      await supabase.from("recovery_logs").upsert({ user_id: user.id, log_date: today, sleep_minutes: minutes });
      setSaving(false);
    }
    advance();
  };

  const saveEnergy = async () => {
    if (energy != null) {
      setSaving(true);
      await supabase.from("recovery_logs").upsert({ user_id: user.id, log_date: today, energy_level: energy });
      setSaving(false);
    }
    advance();
  };

  const step = STEPS[stepIndex];

  const StepShell = ({ children, onNext, nextLabel = "Next", nextDisabled = false }) => (
    <div style={{ position: "fixed", inset: 0, background: "linear-gradient(135deg, var(--primary) 0%, #4A63FF 100%)", zIndex: 100, display: "flex", flexDirection: "column", color: "#fff" }}>
      <div style={{ display: "flex", gap: 4, padding: "18px 20px 0" }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: i <= stepIndex ? "#fff" : "rgba(255,255,255,0.3)" }} />
        ))}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
        {children}
      </div>
      <div style={{ padding: "0 32px 40px" }}>
        <button
          onClick={onNext}
          disabled={nextDisabled || saving}
          style={{ width: "100%", background: "#fff", color: "var(--primary-ink)", border: "none", borderRadius: 14, padding: 16, fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: nextDisabled || saving ? 0.6 : 1 }}
        >
          {saving ? "…" : nextLabel}
        </button>
      </div>
    </div>
  );

  if (step === "weight") {
    return (
      <StepShell onNext={saveWeight}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Good morning</div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, margin: "10px 0 24px" }}>What's today's weight?</div>
        <input
          value={weightInput}
          onChange={(e) => setWeightInput(e.target.value)}
          inputMode="decimal"
          placeholder={unitLabel(unit)}
          autoFocus
          style={{ width: 140, textAlign: "center", fontSize: 32, fontFamily: "var(--font-display)", fontWeight: 700, padding: "14px 0", borderRadius: 16, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff" }}
        />
        <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>{unitLabel(unit)}</div>
      </StepShell>
    );
  }

  if (step === "waist") {
    return (
      <StepShell onNext={saveWaist}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Step 2</div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, margin: "10px 0 24px" }}>Waist measurement?</div>
        <input
          value={waistInput}
          onChange={(e) => setWaistInput(e.target.value)}
          inputMode="decimal"
          placeholder="in"
          autoFocus
          style={{ width: 140, textAlign: "center", fontSize: 32, fontFamily: "var(--font-display)", fontWeight: 700, padding: "14px 0", borderRadius: 16, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff" }}
        />
        <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>inches</div>
        <button onClick={advance} style={{ marginTop: 20, background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: "pointer" }}>Skip</button>
      </StepShell>
    );
  }

  if (step === "sleep") {
    return (
      <StepShell onNext={saveSleep}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Step 3</div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, margin: "10px 0 24px" }}>How many hours did you sleep?</div>
        <input
          value={sleepHours}
          onChange={(e) => setSleepHours(e.target.value)}
          inputMode="decimal"
          placeholder="7.5"
          autoFocus
          style={{ width: 140, textAlign: "center", fontSize: 32, fontFamily: "var(--font-display)", fontWeight: 700, padding: "14px 0", borderRadius: 16, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff" }}
        />
        <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>hours</div>
        <button onClick={advance} style={{ marginTop: 20, background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: "pointer" }}>Skip</button>
      </StepShell>
    );
  }

  if (step === "energy") {
    return (
      <StepShell onNext={saveEnergy} nextDisabled={energy == null}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Step 4</div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, margin: "10px 0 24px" }}>How's your energy today?</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setEnergy(n)}
              style={{
                width: 52, height: 52, borderRadius: "50%", cursor: "pointer",
                border: energy === n ? "2px solid #fff" : "1px solid rgba(255,255,255,0.35)",
                background: energy === n ? "#fff" : "rgba(255,255,255,0.12)",
                color: energy === n ? "var(--primary-ink)" : "#fff",
                fontWeight: 700, fontSize: 16,
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, opacity: 0.85, fontSize: 13 }}>{energy ? ENERGY_LABELS[energy - 1] : "Pick one"}</div>
      </StepShell>
    );
  }

  return (
    <StepShell onNext={onDone} nextLabel="Let's go">
      <div style={{ fontSize: 32, marginBottom: 20 }}>✦</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 21, lineHeight: 1.4, marginBottom: 14 }}>"{quote.quote}"</div>
      <div style={{ opacity: 0.75, fontSize: 13, fontFamily: "var(--font-mono)" }}>— {quote.author}</div>
    </StepShell>
  );
}
