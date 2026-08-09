import { Link } from "react-router-dom";
import { useState } from "react";
import { Card } from "../components/Card";
import { useProfile } from "../hooks/useProfile";
import { useAuth } from "../lib/auth";
import { requestNotificationPermission } from "../lib/notifications";

// Reached via the avatar (see AvatarLink) rather than a bottom-nav tab —
// Coach spec section 1 moves account/settings off the primary nav.
export default function Profile() {
  const { profile, targets, saveProfile } = useProfile();
  const { signOut } = useAuth();
  const [notifStatus, setNotifStatus] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  const setUnit = (unit) => saveProfile({ weight_unit: unit });

  const enableNotifications = async () => {
    const result = await requestNotificationPermission();
    setNotifStatus(result);
  };

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
      <Card>
        <div className="eyebrow">Weight unit</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {["lb", "kg"].map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                border: (profile?.weight_unit ?? "lb") === u ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                background: (profile?.weight_unit ?? "lb") === u ? "var(--primary-tint)" : "var(--surface)",
                color: (profile?.weight_unit ?? "lb") === u ? "var(--primary)" : "var(--text)",
                fontWeight: 600, fontSize: 13, textTransform: "uppercase",
              }}
            >
              {u}
            </button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Everything's stored in lb behind the scenes — this only changes what's displayed.</div>
      </Card>
      <Card tight><div className="row"><span className="muted">Daily step goal</span><span>{profile?.step_goal}</span></div></Card>

      <Card>
        <div className="eyebrow">Notifications</div>
        {notifStatus === "granted" ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Enabled — you'll get a notification when a weekly review is ready.</div>
        ) : notifStatus === "denied" ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Blocked in your browser settings — re-enable there if you want review alerts.</div>
        ) : notifStatus === "unsupported" ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Not supported in this browser.</div>
        ) : (
          <>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 6, marginBottom: 10 }}>Get notified when a weekly review is ready. Works while the app is open or recently backgrounded — not a full background push.</div>
            <button className="btnGhost" onClick={enableNotifications}>Enable notifications</button>
          </>
        )}
      </Card>
      <Card tight><div className="row"><span className="muted">Training days / week</span><span>{profile?.training_days_per_week}</span></div></Card>
      <Card tight><div className="row"><span className="muted">Training experience</span><span style={{ textTransform: "capitalize" }}>{profile?.training_experience ?? "—"}</span></div></Card>
      <Card tight><div className="row"><span className="muted">Equipment</span><span style={{ textTransform: "capitalize" }}>{profile?.equipment?.replace("_", " ") ?? "—"}</span></div></Card>
      <button className="btnGhost" onClick={signOut}>Sign out</button>
    </div>
  );
}
