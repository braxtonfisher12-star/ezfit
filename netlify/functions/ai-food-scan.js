// Netlify function — POST { imageBase64, mediaType } -> structured meal breakdown.
// Runs server-side so ANTHROPIC_API_KEY never reaches the client. This is the
// backend for the "AI Scan" flow (spec sections 24-26): detect foods in a photo,
// estimate portions, and return per-item confidence rather than a single
// unqualified number, per the spec's accuracy philosophy (section 25).

const SYSTEM_PROMPT = `You are the meal-estimation engine behind a fitness app called EZfit.
Given a photo of a plate of food, identify each distinct food item, estimate its portion size,
and estimate calories and macros. Be conservative and honest about uncertainty: mark each item's
confidence as "high", "medium", or "low" depending on how visible/ambiguous the portion and
preparation are. Respond with ONLY valid JSON, no prose, no markdown fences, matching exactly
this shape:
{
  "items": [
    { "name": string, "estimatedQuantity": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "confidence": "high"|"medium"|"low" }
  ],
  "totals": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }
}`;

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { imageBase64, mediaType } = JSON.parse(event.body);
    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: "imageBase64 is required" }) };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
              { type: "text", text: "Analyze this meal." },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: 502, body: JSON.stringify({ error: "Upstream error", detail: errText }) };
    }

    const data = await response.json();
    const textBlock = data.content.find((b) => b.type === "text");
    const cleaned = (textBlock?.text ?? "{}").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
