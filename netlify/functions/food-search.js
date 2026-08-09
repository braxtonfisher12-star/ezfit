// Netlify function — GET ?q=chicken+breast -> normalized food results.
// Backs the Food tab's search. Source: USDA FoodData Central, which is free
// and covers ~600,000 items (branded + raw/generic foods with lab-grade
// macros). Needs a free API key from https://fdc.nal.usda.gov/api-key-signup
// — falls back to the shared "DEMO_KEY" (tightly rate-limited) if you haven't
// set one yet, so search works out of the box during setup.
//
// Results are normalized to the same shape as rows in the `foods` table so
// the frontend can treat "the database" as one seamless, effectively
// unlimited set: local table (your own + saved entries) plus FDC on demand.

const FDC_API_KEY = process.env.FDC_API_KEY || "DEMO_KEY";

function normalizeFdcItem(item) {
  const nutrient = (name) => item.foodNutrients?.find((n) => n.nutrientName?.includes(name))?.value ?? 0;
  return {
    external_source: "usda",
    external_id: String(item.fdcId),
    name: item.description,
    brand: item.brandOwner || null,
    state: /cooked|roasted|baked|grilled|boiled/i.test(item.description) ? "cooked" : /raw/i.test(item.description) ? "raw" : "n/a",
    serving_qty: 100,
    serving_unit: "g",
    calories: Math.round(nutrient("Energy")),
    protein_g: Math.round(nutrient("Protein") * 10) / 10,
    carbs_g: Math.round(nutrient("Carbohydrate") * 10) / 10,
    fat_g: Math.round(nutrient("Total lipid") * 10) / 10,
  };
}

export async function handler(event) {
  const query = event.queryStringParameters?.q;
  if (!query || query.length < 2) {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ results: [] }) };
  }

  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${FDC_API_KEY}&query=${encodeURIComponent(query)}&pageSize=15&dataType=Foundation,SR%20Legacy,Branded`;
    const res = await fetch(url);
    if (!res.ok) {
      const detail = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: "USDA FDC error", detail }) };
    }
    const data = await res.json();
    const results = (data.foods ?? []).map(normalizeFdcItem).filter((f) => f.calories > 0);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ results }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
