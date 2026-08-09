import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import AvatarLink from "../components/AvatarLink";
import MacroDonut from "../components/MacroDonut";
import Skeleton from "../components/Skeleton";
import SwipeToDelete from "../components/SwipeToDelete";
import { Card } from "../components/Card";
import { useWeekFood } from "../hooks/useWeekFood";
import { useProfile } from "../hooks/useProfile";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";
import { pct } from "../lib/nutritionMath";
import { toISODate, dayLabel, formatHourSlot, slotKey } from "../lib/dateUtils";
import { useCountUp } from "../lib/useCountUp";

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function hourTint(hour) {
  const h = hour % 24;
  if (h < 11) return "rgba(198,134,42,0.05)";
  if (h < 17) return "transparent";
  return "rgba(43,76,255,0.05)";
}

function dominantMacroColor(item) {
  const f = item.food;
  if (!f) return "var(--border)";
  const factor = f.serving_qty ? item.quantity / f.serving_qty : 1;
  const p = (f.protein_g ?? 0) * factor * 4;
  const c = (f.carbs_g ?? 0) * factor * 4;
  const fat = (f.fat_g ?? 0) * factor * 9;
  const max = Math.max(p, c, fat);
  if (max === 0) return "var(--border)";
  if (max === p) return "var(--protein)";
  if (max === c) return "var(--carbs)";
  return "var(--fat)";
}

function TrendArrow({ current, previous }) {
  if (previous == null || previous === 0) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 1) return null;
  const up = delta > 0;
  return (
    <span style={{ fontSize: 10, color: up ? "var(--warning)" : "var(--success)", fontFamily: "var(--font-mono)" }}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(delta))}
    </span>
  );
}

export default function Food() {
  const { user } = useAuth();
  const { targets } = useProfile();
  const { week, mealsByDate, totalsForDate, cardioForDate, loading, reload } = useWeekFood();
  const [selected, setSelected] = useState(toISODate(new Date()));
  const [copying, setCopying] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const navigate = useNavigate();

  const baseCalTarget = targets?.calories ?? 2200;
  const cardioToday = cardioForDate(selected);
  const calTarget = baseCalTarget + cardioToday;
  const dayMeals = mealsByDate[selected] ?? [];
  const totals = totalsForDate(selected);
  const animatedCalories = useCountUp(Math.round(totals.calories));

  const prevDayISO = addDays(selected, -1);
  const prevTotals = totalsForDate(prevDayISO);

  const occupiedHours = [...new Set(dayMeals.filter((m) => m.logged_time).map((m) => Number(m.logged_time.slice(0, 2))))].sort((a, b) => a - b);

  const mealForHour = (hour) => dayMeals.find((m) => Number((m.logged_time ?? "").slice(0, 2)) === hour);
  const itemsForHour = (hour) => mealForHour(hour)?.meal_items ?? [];

  const deleteItem = async (itemId) => {
    await supabase.from("meal_items").delete().eq("id", itemId);
    reload();
  };

  const saveAsMeal = async (hour) => {
    const meal = mealForHour(hour);
    if (!meal || !meal.meal_items?.length) return;
    const name = window.prompt("Name this saved meal:", meal.meal_items.map((it) => it.food?.name).join(", ").slice(0, 40));
    if (!name) return;
    const { data: savedMeal } = await supabase.from("meals").insert({ user_id: user.id, meal_date: selected, name, is_saved_meal: true }).select().single();
    await supabase.from("meal_items").insert(
      meal.meal_items.map((it) => ({ meal_id: savedMeal.id, food_id: it.food_id, quantity: it.quantity, unit: it.unit, source: "saved_meal" }))
    );
  };

  const copyYesterday = async () => {
    setCopying(true);
    const yMeals = mealsByDate[prevDayISO] ?? [];
    for (const m of yMeals) {
      if (!m.meal_items?.length) continue;
      const { data: newMeal } = await supabase.from("meals").insert({ user_id: user.id, meal_date: selected, logged_time: m.logged_time }).select().single();
      await supabase.from("meal_items").insert(
        m.meal_items.map((it) => ({ meal_id: newMeal.id, food_id: it.food_id, quantity: it.quantity, unit: it.unit, source: it.source }))
      );
    }
    setCopying(false);
    reload();
  };

  const weekTotals = week.map((d) => totalsForDate(toISODate(d)));
  const loggedDays = weekTotals.filter((t) => t.calories > 0);
  const avgCalories = loggedDays.length ? loggedDays.reduce((s, t) => s + t.calories, 0) / loggedDays.length : 0;
  const avgProtein = loggedDays.length ? loggedDays.reduce((s, t) => s + t.protein_g, 0) / loggedDays.length : 0;
  const avgCarbs = loggedDays.length ? loggedDays.reduce((s, t) => s + t.carbs_g, 0) / loggedDays.length : 0;
  const avgFat = loggedDays.length ? loggedDays.reduce((s, t) => s + t.fat_g, 0) / loggedDays.length : 0;
  const onTargetDays = loggedDays.filter((t) => Math.abs(t.calories - baseCalTarget) / baseCalTarget < 0.1).length;

  if (loading) {
    return (
      <>
        <div className="content">
          <div className="row"><h1 className="pageTitle">Food</h1><AvatarLink /></div>
          <Skeleton height={64} style={{ marginBottom: 14 }} />
          <Skeleton height={180} radius={18} style={{ marginBottom: 14 }} />
          <Skeleton height={80} radius={18} style={{ marginBottom: 10 }} />
          <Skeleton height={80} radius={18} />
        </div>
        <BottomNav />
      </>
    );
  }

  return (
    <>
      <div className="content">
        <div className="row"><h1 className="pageTitle">Food</h1><AvatarLink /></div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
          {week.map((d) => {
            const iso = toISODate(d);
            const dayTotals = totalsForDate(iso);
            const isSelected = iso === selected;
            const dayTarget = baseCalTarget + cardioForDate(iso);
            const onTarget = dayTarget ? Math.abs(dayTotals.calories - dayTarget) / dayTarget < 0.1 : false;
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                style={{
                  flex: "1 0 auto", minWidth: 44, padding: "8px 4px", borderRadius: 12,
                  border: isSelected ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                  background: isSelected ? "var(--primary-tint)" : "var(--surface)",
                  cursor: "pointer", textAlign: "center",
                }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{dayLabel(d)}</div>
                <div style={{ fontWeight: 700, fontSize: 14, margin: "2px 0" }}>{d.getDate()}</div>
                <div style={{ width: 5, height: 5, borderRadius: "50%", margin: "0 auto", background: dayTotals.calories === 0 ? "var(--border)" : onTarget ? "var(--success)" : "var(--warning)" }} />
              </button>
            );
          })}
        </div>

        <div style={{ background: "linear-gradient(135deg, var(--primary) 0%, #4A63FF 100%)", borderRadius: 18, padding: 18, color: "#fff", boxShadow: "0 8px 20px -8px rgba(43,76,255,0.4)", marginBottom: 14 }}>
          <div className="row" style={{ marginBottom: 4 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Daily nutrition</span>
            {cardioToday > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "rgba(255,255,255,0.2)", padding: "3px 8px", borderRadius: 99 }}>+{cardioToday} kcal cardio</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
            <MacroDonut proteinG={totals.protein_g} carbsG={totals.carbs_g} fatG={totals.fat_g} size={110} strokeWidth={13} light />
            <div style={{ flex: 1 }}>
              <div className="count-up" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30 }}>{animatedCalories}<span style={{ fontSize: 14, opacity: 0.75, fontWeight: 500 }}> / {calTarget} kcal</span></div>
              {[
                ["Protein", totals.protein_g, targets?.protein_g ?? 180],
                ["Carbs", totals.carbs_g, targets?.carbs_g ?? 200],
                ["Fat", totals.fat_g, targets?.fat_g ?? 70],
              ].map(([label, cur, tgt]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, opacity: 0.9, marginTop: 4 }}>
                  <span>{label}</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{Math.round(cur)}/{tgt}g <TrendArrow current={cur} previous={prevTotals[label === "Protein" ? "protein_g" : label === "Carbs" ? "carbs_g" : "fat_g"]} /></span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => navigate("/food/add")} style={{ flex: 1, background: "#fff", color: "var(--primary-ink)", border: "none", borderRadius: 12, padding: 11, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Add food</button>
            <button onClick={copyYesterday} disabled={copying} style={{ flex: 1, background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 12, padding: 11, fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>
              {copying ? "Copying…" : "Copy yesterday"}
            </button>
          </div>
        </div>

        <div className="eyebrow" style={{ marginTop: 4 }}>Timeline</div>
        {occupiedHours.length === 0 ? (
          <Card style={{ textAlign: "center", padding: "32px 16px" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" style={{ margin: "0 auto 10px", opacity: 0.35 }}>
              <path d="M6 3v8a3 3 0 0 0 3 3v7M6 3v6M8 3v6M4 3v6M17 3c-2 1-2.5 4-2.5 6 0 2 1 3 2.5 3v9" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="muted" style={{ marginBottom: 10 }}>Nothing logged yet {selected === toISODate(new Date()) ? "today" : "this day"}.</div>
            <button className="btnGhost" onClick={() => navigate("/food/add")}>Log something</button>
          </Card>
        ) : (
          <div style={{ position: "relative", paddingLeft: 8 }}>
            <div style={{ position: "absolute", left: 34, top: 6, bottom: 6, width: 1.5, background: "var(--border)" }} />
            {occupiedHours.map((hour) => {
              const items = itemsForHour(hour);
              return (
                <div key={hour} style={{ display: "flex", gap: 10, marginBottom: 10, position: "relative", background: hourTint(hour), borderRadius: 12, padding: "4px 2px" }}>
                  <div style={{ width: 44, flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-faint)", paddingTop: 10, position: "relative", zIndex: 1 }}>
                    {formatHourSlot(hour)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="row" style={{ marginBottom: 3 }}>
                      <span className="muted" style={{ fontSize: 10 }} />
                      <button onClick={() => saveAsMeal(hour)} style={{ background: "none", border: "none", color: "var(--primary)", fontSize: 10.5, cursor: "pointer", padding: 0 }}>Save as meal</button>
                    </div>
                    {items.map((it) => (
                      <SwipeToDelete key={it.id} onDelete={() => deleteItem(it.id)}>
                        <div
                          onClick={() => navigate("/food/add", { state: { date: selected, hour: slotKey(hour) } })}
                          style={{ cursor: "pointer", padding: "9px 12px", borderLeft: `3px solid ${dominantMacroColor(it)}`, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 6 }}
                        >
                          <div className="row" style={{ fontSize: 13 }}>
                            <span>{it.food?.name}</span>
                            <span className="muted">{Math.round((it.food?.calories ?? 0) * (it.food?.serving_qty ? it.quantity / it.food.serving_qty : 1))} kcal</span>
                          </div>
                        </div>
                      </SwipeToDelete>
                    ))}
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => navigate("/food/add", { state: { date: selected, hour: `${String(new Date().getHours()).padStart(2, "0")}:00` } })}
              className="btnGhost"
              style={{ marginTop: 6 }}
            >
              + Log more food
            </button>
          </div>
        )}

        <Card style={{ marginTop: 16 }}>
          <div className="eyebrow">This week</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <div><div className="bigNum" style={{ fontSize: 18 }}>{Math.round(avgCalories)}</div><div className="muted" style={{ fontSize: 10.5 }}>avg kcal</div></div>
            <div><div className="bigNum" style={{ fontSize: 18 }}>{Math.round(avgProtein)}g</div><div className="muted" style={{ fontSize: 10.5 }}>avg protein</div></div>
            <div><div className="bigNum" style={{ fontSize: 18 }}>{Math.round(avgCarbs)}g</div><div className="muted" style={{ fontSize: 10.5 }}>avg carbs</div></div>
            <div><div className="bigNum" style={{ fontSize: 18 }}>{Math.round(avgFat)}g</div><div className="muted" style={{ fontSize: 10.5 }}>avg fat</div></div>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>{onTargetDays} of {loggedDays.length} logged days within 10% of target</div>
        </Card>
      </div>
      <BottomNav />
    </>
  );
}
