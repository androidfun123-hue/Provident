import { applyCors, getClientIp, createRateLimiter, sendLeadEmail } from "./_lib.js";

const RATE_LIMIT_PER_DAY = 60;
const MAX_USER_TURNS = 14;
const GEMINI_MODEL = "gemini-3.5-flash";

const isRateLimited = createRateLimiter(RATE_LIMIT_PER_DAY);

const SYSTEM_PROMPT = `You are a sharp, energetic insurance and financial-planning agent working a roadshow booth for Provident Financial Planning in Singapore. Someone just walked up to your booth and started chatting.

Your goal: hook their interest fast, keep the conversation moving, and by the end of the chat have gathered: their name, a way to contact them (email or phone), what they're interested in (life insurance, health insurance, business insurance, financial planning, or general/not sure), whether they already have coverage in that area, and how soon they want to sort it out.

Style:
- Warm, confident, a little assumptive — act like taking the next step is natural, not a big ask.
- Ask ONE question at a time. Never dump a list of questions.
- Briefly acknowledge what they just said before moving on, so it feels like a real conversation, not a form.
- Keep replies SHORT — 1 to 3 sentences. Roadshow attention spans are short.
- If they try to wrap up before giving contact info, make ONE warm, low-pressure attempt to get at least an email or phone number before letting them go gracefully. Never guilt-trip or refuse to end the chat.
- Do not invent promises, discounts, prices, or guarantees you were not given. Do not diagnose their insurance needs or give specific policy advice — that is for a licensed follow-up call, not this chat.
- Do not be a pushover: if they dodge a question, gently redirect once, but don't loop on the same question forever.

You are done qualifying them once you have name + a contact method + their interest area (or you've made a genuine attempt and they clearly want to stop). When you're done, wrap up warmly, thank them, let them know someone will follow up, and set "done": true.

Respond ONLY with a single JSON object, no other text, matching exactly this shape:
{
  "reply": "string — what you say next to the visitor",
  "done": boolean,
  "lead": null or {
    "name": "string or null",
    "contact": "string or null (email or phone, as given)",
    "interest": "string or null",
    "existing_coverage": "string or null",
    "urgency_signal": "string or null",
    "notes": "string or null — anything else relevant they mentioned"
},
  "summary": "string or null — 2-3 plain-language sentences summarizing this lead for the agent who will follow up (only when done is true)",
  "urgency": "hot" or "warm" or "cold" or null (only when done is true),
  "suggested_next_step": "string or null — one short sentence (only when done is true)"
}

Set "lead", "summary", "urgency" and "suggested_next_step" to null while done is false.`;

function toGeminiContents(history) {
  return history
    .filter((m) => m && typeof m.text === "string" && (m.role === "user" || m.role === "model"))
    .slice(-40)
    .map((m) => ({ role: m.role, parts: [{ text: String(m.text).slice(0, 1000) }] }));
}

function fallbackResponse() {
  return {
    reply:
      "Sorry, I'm having a little trouble on my end right now — could you leave your name and the best way to reach you (email or phone)? Someone from Provident Financial Planning will follow up personally.",
    done: false,
    emailSent: null,
};
}

export default async function handler(req, res) {
  const allowedOrigin = applyCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!allowedOrigin) return res.status(403).json({ error: "Origin not allowed" });

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests" });
}

  const body = req.body || {};
  const history = Array.isArray(body.history) ? body.history : [];

  if (history.length === 0 || history.length > 60) {
    return res.status(400).json({ error: "Invalid history" });
  }

  const userTurnCount = history.filter((m) => m && m.role === "user").length;
  const forceWrapUp = userTurnCount >= MAX_USER_TURNS;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const systemText = forceWrapUp
      ? `${SYSTEM_PROMPT}\n\nIMPORTANT: This conversation has gone on long enough. In your reply now, wrap up warmly, thank them, and set "done": true with your best-effort lead fields even if some are incomplete.`
            : SYSTEM_PROMPT;

          const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
{
        method: "POST",
                  headers: {
          "Content-Type": "application/json",
                      "x-goog-api-key": process.env.GEMINI_API_KEY,
            },
                    body: JSON.stringify({
                                system_instruction: { parts: [{ text: systemText }] },
                                contents: toGeminiContents(history),
                                            generationConfig: {
            maxOutputTokens: 400,
                          // REST API field name is snake_case — see note in api/qualify.js history.
                          response_mime_type: "application/json",
              },
}),
        signal: controller.signal,
          }
              );

    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
      throw new Error(`No JSON object found in Gemini response: ${text.slice(0, 120)}`);
    }
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));

    if (!parsed.reply || typeof parsed.reply !== "string") {
      throw new Error("Missing reply field in Gemini response");
    }

    let emailSent = null;
    if (parsed.done && parsed.lead) {
      emailSent = await sendLeadEmail(parsed.lead, {
                summary: parsed.summary,
                urgency: parsed.urgency,
                suggested_next_step: parsed.suggested_next_step,
        });
    }

    return res.status(200).json({
            reply: parsed.reply,
            done: !!parsed.done,
            emailSent,
      });
  } catch (err) {
    clearTimeout(timeout);
    console.error("Chat turn failed, using fallback reply:", err.message);
    return res.status(200).json(fallbackResponse());
  }
  }
