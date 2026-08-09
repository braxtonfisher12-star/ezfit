// Netlify function — GET ?barcode=0123456789012 -> one normalized food.
// Source: Open Food Facts — free, no API key, community-maintained, several
// million barcoded products worldwide. Best source specifically for scanned
// packaged food (the spec's Barcode Scanner flow, section 28); USDA FDC
// (food-search.js) remains the primary source for whole/raw foods and search.
export async function handler(event) {
  const barcode = event.queryStringParameters?.barcode;
  if (!barcode) {
    return { statusCode: 400, body: JSON.stringify({ error: "barcode is required" }) };
  }

  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
    const data = await res.json();
    if (data.status !== 1 || !data.product) {
      return { statusCode: 404, body: JSON.stringify({ error: "Product not found" }) };
    }
    const p = data.product;
    const n = p.nutriments || {};
    const result = {
      external_source: "off",
      external_id: barcode,
      name: p.product_name || "Unknown product",
      brand: p.brands || null,
      state: "n/a",
      serving_qty: n.serving_quantity ? Number(n.serving_quantity) : 100,
      serving_unit: "g",
      calories: Math.round(n["energy-kcal_serving"] ?? n["energy-kcal_100g"] ?? 0),
      protein_g: Math.round((n["proteins_serving"] ?? n["proteins_100g"] ?? 0) * 10) / 10,
      carbs_g: Math.round((n["carbohydrates_serving"] ?? n["carbohydrates_100g"] ?? 0) * 10) / 10,
      fat_g: Math.round((n["fat_serving"] ?? n["fat_100g"] ?? 0) * 10) / 10,
      barcode,
    };
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
