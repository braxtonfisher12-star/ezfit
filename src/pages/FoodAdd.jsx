import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, Pill } from "../components/Card";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { toISODate, formatHourSlot } from "../lib/dateUtils";

export default function FoodAdd() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const fileInput = useRef(null);

  const targetDate = state?.date ?? toISODate(new Date());
  const targetHour = state?.hour ?? `${String(new Date().getHours()).padStart(2, "0")}:00`;

  const [mode, setMode] = useState("menu");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [quickAdd, setQuickAdd] = useState({ name: "", calories: "", protein_g: "", carbs_g: "", fat_g: "" });
  const [scanResult, setScanResult] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeResult, setBarcodeResult] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [savedMeals, setSavedMeals] = useState([]);
  const [showCheck, setShowCheck] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [detailQtyNative, setDetailQtyNative] = useState(0);
  const [displayUnit, setDisplayUnit] = useState("native");

  useEffect(() => {
    (async () => {
      const [{ data: favs }, { data: saved }] = await Promise.all([
        supabase.from("favorite_foods").select("food_id, food:foods(*)").eq("user_id", user.id),
        supabase.from("meals").select("*, meal_items(*, food:foods(name))").eq("user_id", user.id).eq("is_saved_meal", true).order("created_at", { ascending: false }).limit(10),
      ]);
      setFavorites((favs ?? []).map((f) => f.food).filter(Boolean));
      setFavoriteIds(new Set((favs ?? []).map((f) => f.food_id)));
      setSavedMeals(saved ?? []);
    })();
  }, [user]);

  const toggleFavorite = async (food) => {
    const realFood = await ensureLocalFood(food);
    if (favoriteIds.has(realFood.id)) {
      await supabase.from("favorite_foods").delete().eq("user_id", user.id).eq("food_id", realFood.id);
      setFavoriteIds((prev) => { const n = new Set(prev); n.delete(realFood.id); return n; });
      setFavorites((prev) => prev.filter((f) => f.id !== realFood.id));
    } else {
      await supabase.from("favorite_foods").insert({ user_id: user.id, food_id: realFood.id });
      setFavoriteIds((prev) => new Set(prev).add(realFood.id));
      setFavorites((prev) => [...prev, realFood]);
    }
  };

  const GRAMS_PER_OZ = 28.3495;

  const openDetail = (food) => {
    setSelectedFood(food);
    setDetailQtyNative(food.serving_qty || 1);
    setDisplayUnit("native");
    setMode("detail");
  };

  const displayValue = () => {
    if (!selectedFood) return 0;
    return displayUnit === "oz" ? Math.round((detailQtyNative / GRAMS_PER_OZ) * 10) / 10 : Math.round(detailQtyNative * 10) / 10;
  };

  const onDisplayChange = (v) => {
    const num = Number(v);
    if (Number.isNaN(num)) return;
    setDetailQtyNative(displayUnit === "oz" ? num * GRAMS_PER_OZ : num);
  };

  const toggleDisplayUnit = (unit) => {
    setDisplayUnit(unit);
  };

  let searchDebounce;
  const runSearch = async (q) => {
    setQuery(q);
    clearTimeout(searchDebounce);
    if (q.length < 2) return setResults([]);
    searchDebounce = setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      const [{ data: local }, fdcRes] = await Promise.all([
        supabase.from("foods").select("*").ilike("name", `%${q}%`).limit(8),
        fetch(`/.netlify/functions/food-search?q=${encodeURIComponent(q)}`)
          .then((r) => {
            if (!r.ok) throw new Error(`Search function returned ${r.status}`);
            return r.json();
          })
          .catch((err) => {
            console.error("USDA food search unreachable:", err);
            setSearchError(true);
            return { results: [] };
          }),
      ]);
      const fdc = (fdcRes.results ?? []).map((f) => ({ ...f, id: `fdc:${f.external_id}` }));
      setResults([...(local ?? []), ...fdc]);
      setSearching(false);
    }, 350);
  };

  const ensureLocalFood = async (food) => {
    if (food.id && !String(food.id).startsWith("fdc:")) return food;
    const { data, error } = await supabase
      .from("foods")
      .insert({
        user_id: user.id,
        name: food.name,
        brand: food.brand,
        state: food.state,
        serving_qty: food.serving_qty,
        serving_unit: food.serving_unit,
        calories: food.calories,
        protein_g: food.protein_g,
        carbs_g: food.carbs_g,
        fat_g: food.fat_g,
        external_source: food.external_source,
        external_id: food.external_id,
      })
      .select()
      .single();
    if (error) throw new Error(`Couldn't save this food: ${error.message}`);
    return data;
  };

  const addFoodToMeal = async (foodInput, quantity, source, confidence) => {
    try {
      const food = await ensureLocalFood(foodInput);
      let { data: meal, error: mealFetchError } = await supabase
        .from("meals")
        .select("id")
        .eq("user_id", user.id)
        .eq("meal_date", targetDate)
        .eq("logged_time", targetHour)
        .maybeSingle();
      if (mealFetchError) throw new Error(`Couldn't check today's log: ${mealFetchError.message}`);
      if (!meal) {
        const { data: newMeal, error: mealInsertError } = await supabase
          .from("meals")
          .insert({ user_id: user.id, meal_date: targetDate, logged_time: targetHour })
          .select()
          .single();
        if (mealInsertError) throw new Error(`Couldn't create today's log entry: ${mealInsertError.message}`);
        meal = newMeal;
      }
      const { error: itemError } = await supabase.from("meal_items").insert({
        meal_id: meal.id,
        food_id: food.id,
        quantity,
        unit: food.serving_unit,
        source,
        ai_confidence: confidence ?? null,
      });
      if (itemError) throw new Error(`Couldn't add this food: ${itemError.message}`);
      setShowCheck(true);
      setTimeout(() => { setShowCheck(false); navigate("/food"); }, 550);
    } catch (err) {
      console.error("addFoodToMeal failed:", err);
      alert(err.message || "Something went wrong adding this food. Please try again.");
    }
  };

  const applySavedMeal = async (savedMeal) => {
    let { data: meal } = await supabase
      .from("meals")
      .select("id")
      .eq("user_id", user.id)
      .eq("meal_date", targetDate)
      .eq("logged_time", targetHour)
      .maybeSingle();
    if (!meal) {
      const { data: newMeal } = await supabase
        .from("meals")
        .insert({ user_id: user.id, meal_date: targetDate, logged_time: targetHour })
        .select()
        .single();
      meal = newMeal;
    }
    await supabase.from("meal_items").insert(
      (savedMeal.meal_items ?? []).map((it) => ({ meal_id: meal.id, food_id: it.food_id, quantity: it.quantity, unit: it.unit, source: "saved_meal" }))
    );
    setShowCheck(true);
    setTimeout(() => navigate("/food"), 550);
  };

  const submitQuickAdd = async () => {
    const { data: food } = await supabase
      .from("foods")
      .insert({
        user_id: user.id,
        name: quickAdd.name || "Quick add",
        calories: Number(quickAdd.calories) || 0,
        protein_g: Number(quickAdd.protein_g) || 0,
        carbs_g: Number(quickAdd.carbs_g) || 0,
        fat_g: Number(quickAdd.fat_g) || 0,
        serving_qty: 1,
        serving_unit: "serving",
      })
      .select()
      .single();
    addFoodToMeal(food, 1, "quick_add");
  };

  const runBarcodeLookup = async () => {
    if (!barcodeInput) return;
    const res = await fetch(`/.netlify/functions/barcode-lookup?barcode=${encodeURIComponent(barcodeInput)}`);
    if (!res.ok) return setBarcodeResult({ error: true });
    setBarcodeResult(await res.json());
  };

  const runAiScan = async (file) => {
    setMode("scanning");
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(",")[1];
      try {
        const res = await fetch("/.netlify/functions/ai-food-scan", { method: "POST", body: JSON.stringify({ imageBase64: base64, mediaType: file.type }) });
        setScanResult(await res.json());
        setMode("scanResult");
      } catch (err) {
        console.error(err);
        setMode("menu");
      }
    };
    reader.readAsDataURL(file);
  };

  const slotLabel = `${targetDate} · ${formatHourSlot(Number(targetHour.slice(0, 2)))}`;
  const BackBtn = ({ onClick }) => (
    <button onClick={onClick} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 10 }}>&larr; Back</button>
  );

  const CheckOverlay = () => showCheck ? (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div className="check-pop" style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--success)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="34" height="34" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
    </div>
  ) : null;

  if (mode === "scanning") return <div className="content" style={{ textAlign: "center", paddingTop: 80 }}>Analyzing your meal…</div>;

  if (mode === "scanResult" && scanResult) {
    return (
      <div className="content">
        <CheckOverlay />
        <BackBtn onClick={() => setMode("menu")} />
        <div className="eyebrow">Meal detected — logging to {slotLabel}</div>
        {scanResult.items?.map((it, i) => (
          <Card tight key={i}>
            <div className="row"><span style={{ fontWeight: 600 }}>{it.name}</span><Pill tone={it.confidence === "high" ? "green" : it.confidence === "medium" ? "amber" : "red"}>{it.confidence} confidence</Pill></div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{it.estimatedQuantity} · {it.calories} kcal</div>
          </Card>
        ))}
        <Card style={{ background: "var(--primary-tint)", borderColor: "var(--primary)" }}>
          <div className="eyebrow" style={{ color: "var(--primary)" }}>Estimated total</div>
          <div className="bigNum" style={{ fontSize: 26, color: "var(--primary-ink)" }}>{scanResult.totals?.calories} kcal</div>
        </Card>
        <button
          className="btnPrimary"
          onClick={async () => {
            const { data: food } = await supabase
              .from("foods")
              .insert({ user_id: user.id, name: scanResult.items.map((i) => i.name).join(", "), calories: scanResult.totals.calories, protein_g: scanResult.totals.protein_g, carbs_g: scanResult.totals.carbs_g, fat_g: scanResult.totals.fat_g, serving_qty: 1, serving_unit: "meal" })
              .select()
              .single();
            addFoodToMeal(food, 1, "ai_scan", "medium");
          }}
        >
          Add to {formatHourSlot(Number(targetHour.slice(0, 2)))}
        </button>
      </div>
    );
  }

  if (mode === "search") {
    return (
      <div className="content">
        <CheckOverlay />
        <BackBtn onClick={() => setMode("menu")} />
        <div className="eyebrow">Logging to {slotLabel}</div>
        <div className="field"><label>Search</label><input value={query} onChange={(e) => runSearch(e.target.value)} autoFocus placeholder="e.g. chicken breast" /></div>
        {searching && <div className="muted">Searching…</div>}
        {searchError && (
          <Card style={{ background: "var(--critical-tint)", borderColor: "var(--critical)" }}>
            <div style={{ fontWeight: 600, color: "var(--critical)", fontSize: 13 }}>Couldn't reach the USDA food database</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Still showing your own saved foods below. Local dev needs netlify dev; works automatically once deployed.</div>
          </Card>
        )}
        {!searching && query.length >= 2 && results.length === 0 && !searchError && (
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>No results for "{query}". Try Quick Add instead.</div>
        )}
        {results.map((f) => (
          <Card tight key={f.id}>
            <div className="row">
              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => openDetail(f)}>
                <div style={{ fontSize: 13.5 }}>{f.name}{f.brand ? ` (${f.brand})` : ""}{f.state && f.state !== "n/a" ? ` — ${f.state}` : ""}</div>
                <div className="muted" style={{ fontSize: 11 }}>{f.calories} kcal /{f.serving_qty}{f.serving_unit} · tap for details</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 10 }}>
                <button
                  onClick={() => toggleFavorite(f)}
                  aria-label="Favorite"
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: favoriteIds.has(f.id) ? "var(--warning)" : "var(--text-faint)", padding: 4 }}
                >
                  ★
                </button>
                <button
                  onClick={() => addFoodToMeal(f, f.serving_qty, f.external_source ? "search" : "recent")}
                  aria-label={`Add ${f.name}`}
                  style={{
                    width: 30, height: 30, borderRadius: "50%", border: "none", background: "var(--primary)",
                    color: "#fff", fontSize: 18, lineHeight: 1, cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (mode === "detail" && selectedFood) {
    const factor = selectedFood.serving_qty ? detailQtyNative / selectedFood.serving_qty : 1;
    const macros = {
      calories: Math.round((selectedFood.calories ?? 0) * factor),
      protein_g: Math.round((selectedFood.protein_g ?? 0) * factor * 10) / 10,
      carbs_g: Math.round((selectedFood.carbs_g ?? 0) * factor * 10) / 10,
      fat_g: Math.round((selectedFood.fat_g ?? 0) * factor * 10) / 10,
    };
    const canToggleOz = selectedFood.serving_unit === "g";
    const unitLabelText = displayUnit === "oz" ? "oz" : selectedFood.serving_unit;

    return (
      <div className="content">
        <CheckOverlay />
        <BackBtn onClick={() => setMode("search")} />
        <div className="eyebrow">Logging to {slotLabel}</div>
        <h1 className="pageTitle" style={{ fontSize: 20 }}>{selectedFood.name}</h1>
        {selectedFood.brand && <p className="muted" style={{ marginTop: -8 }}>{selectedFood.brand}</p>}

        <Card style={{ background: "var(--primary-tint)", borderColor: "var(--primary)" }}>
          <div className="eyebrow" style={{ color: "var(--primary)" }}>Macro breakdown</div>
          <div className="bigNum" style={{ fontSize: 30, color: "var(--primary-ink)", margin: "4px 0 10px" }}>{macros.calories} <span style={{ fontSize: 14, fontWeight: 500 }}>kcal</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {[["Protein", macros.protein_g, "var(--protein)"], ["Carbs", macros.carbs_g, "var(--carbs)"], ["Fat", macros.fat_g, "var(--fat)"]].map(([label, val, color]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, margin: "0 auto 4px" }} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600 }}>{val}g</div>
                <div className="muted" style={{ fontSize: 10.5 }}>{label}</div>
              </div>
            ))}
          </div>
        </Card>

        {canToggleOz && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {["native", "oz"].map((u) => (
              <button
                key={u}
                onClick={() => toggleDisplayUnit(u)}
                style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: displayUnit === u ? "1.5px solid var(--primary)" : "1px solid var(--border)", background: displayUnit === u ? "var(--primary-tint)" : "var(--surface)", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}
              >
                {u === "native" ? "Grams" : "Ounces"}
              </button>
            ))}
          </div>
        )}

        <div className="field">
          <label>Amount ({unitLabelText})</label>
          <input value={displayValue()} onChange={(e) => onDisplayChange(e.target.value)} inputMode="decimal" />
        </div>

        <div className="eyebrow">Quick amounts</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {[0.5, 1, 1.5, 2].map((mult) => (
            <button
              key={mult}
              onClick={() => setDetailQtyNative((selectedFood.serving_qty || 1) * mult)}
              style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 12.5 }}
            >
              {mult}×
            </button>
          ))}
        </div>

        <button className="btnPrimary" onClick={() => addFoodToMeal(selectedFood, detailQtyNative, selectedFood.external_source ? "search" : "recent")}>
          Add to {formatHourSlot(Number(targetHour.slice(0, 2)))}
        </button>
      </div>
    );
  }

  if (mode === "barcode") {
    return (
      <div className="content">
        <CheckOverlay />
        <BackBtn onClick={() => setMode("menu")} />
        <div className="eyebrow">Logging to {slotLabel}</div>
        <div className="field"><label>Barcode (UPC/EAN)</label><input value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} placeholder="Scan or type digits" autoFocus /></div>
        <button className="btnGhost" onClick={runBarcodeLookup}>Look up</button>
        {barcodeResult?.error && <p className="pill red" style={{ marginTop: 10 }}>Not found in Open Food Facts.</p>}
        {barcodeResult && !barcodeResult.error && (
          <Card style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600 }}>{barcodeResult.name}{barcodeResult.brand ? ` — ${barcodeResult.brand}` : ""}</div>
            <div className="muted" style={{ fontSize: 12, margin: "4px 0 10px" }}>{barcodeResult.calories} kcal · {barcodeResult.protein_g}g protein</div>
            <button className="btnPrimary" onClick={() => addFoodToMeal({ ...barcodeResult, id: `fdc:${barcodeResult.external_id}` }, barcodeResult.serving_qty, "barcode")}>Add to {formatHourSlot(Number(targetHour.slice(0, 2)))}</button>
          </Card>
        )}
      </div>
    );
  }

  if (mode === "quick") {
    return (
      <div className="content">
        <CheckOverlay />
        <BackBtn onClick={() => setMode("menu")} />
        <div className="eyebrow">Logging to {slotLabel}</div>
        <h1 className="pageTitle" style={{ fontSize: 20 }}>Quick add</h1>
        <div className="field"><label>Name (optional)</label><input value={quickAdd.name} onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })} /></div>
        <div className="field"><label>Calories</label><input value={quickAdd.calories} onChange={(e) => setQuickAdd({ ...quickAdd, calories: e.target.value })} /></div>
        <div className="field"><label>Protein (g)</label><input value={quickAdd.protein_g} onChange={(e) => setQuickAdd({ ...quickAdd, protein_g: e.target.value })} /></div>
        <div className="field"><label>Carbs (g)</label><input value={quickAdd.carbs_g} onChange={(e) => setQuickAdd({ ...quickAdd, carbs_g: e.target.value })} /></div>
        <div className="field"><label>Fat (g)</label><input value={quickAdd.fat_g} onChange={(e) => setQuickAdd({ ...quickAdd, fat_g: e.target.value })} /></div>
        <button className="btnPrimary" onClick={submitQuickAdd}>Add</button>
      </div>
    );
  }

  return (
    <div className="content">
      <CheckOverlay />
      <BackBtn onClick={() => navigate("/food")} />
      <div className="eyebrow">Logging to {slotLabel}</div>
      <h1 className="pageTitle" style={{ fontSize: 22 }}>How do you want to log?</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
        <Card tight style={{ textAlign: "center", cursor: "pointer" }} onClick={() => fileInput.current.click()}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>AI scan</div><div className="muted" style={{ fontSize: 11 }}>Photo of your meal</div>
        </Card>
        <input ref={fileInput} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files[0] && runAiScan(e.target.files[0])} />
        <Card tight style={{ textAlign: "center", cursor: "pointer" }} onClick={() => setMode("search")}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Search</div><div className="muted" style={{ fontSize: 11 }}>USDA database — 600k+ foods</div>
        </Card>
        <Card tight style={{ textAlign: "center", cursor: "pointer" }} onClick={() => setMode("barcode")}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Barcode</div><div className="muted" style={{ fontSize: 11 }}>Packaged food</div>
        </Card>
        <Card tight style={{ textAlign: "center", cursor: "pointer" }} onClick={() => setMode("quick")}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Quick add</div><div className="muted" style={{ fontSize: 11 }}>Manual macros</div>
        </Card>
      </div>

      {favorites.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 16 }}>Favorites</div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            {favorites.map((f) => (
              <button
                key={f.id}
                onClick={() => addFoodToMeal(f, f.serving_qty, "recent")}
                style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}
              >
                ★ {f.name}
              </button>
            ))}
          </div>
        </>
      )}

      {savedMeals.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 16 }}>Saved meals</div>
          {savedMeals.map((m) => (
            <Card tight key={m.id} onClick={() => applySavedMeal(m)} style={{ cursor: "pointer" }}>
              <div className="row">
                <span>{m.name || m.meal_items?.map((it) => it.food?.name).join(", ")}</span>
                <span className="muted">{m.meal_items?.length ?? 0} items</span>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
