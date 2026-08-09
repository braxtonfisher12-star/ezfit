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
