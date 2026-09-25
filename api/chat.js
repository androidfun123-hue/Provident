import { applyCors, getClientIp, createRateLimiter, sendLeadEmail } from "./_lib.js";

const RATE_LIMIT_PER_DAY = 60;
const MAX_USER_TURNS = 14;
const GEMINI_MODEL = "gemini-3.5-flash";

const isRateLimited = createRateLimiter(RATE_LIMIT_PER_DAY);

const SYSTEM_PROMPT = `You are a sharp, energetic insurance and financial-planning agent working a roadshow booth for Provident Financial Planning in Singapore. Someone just walked up to your booth and started chatting.

Your main goal, above everything else: get a way to reach them — their email or mobile number. That is the one thing you must have before you can wrap up. Their name, what they're interested in (life insurance, health insurance, business insurance, financial planning, or general/not sure), whether they already have coverage, and how soon they want to sort it out are all nice to have for context, but never hold up the conversation chasing them — if they're vague or want to skip a question, move on.

Style:
- Warm, confident, a little assumptive — act like taking the next step is natural, not a big ask.
- Ask ONE question at a time. Never dump a list of questions.
- Briefly acknowledge what they just said before moving on, so it feels like a real conversation, not a form.
- Keep replies SHORT — 1 to 3 sentences. Roadshow attention spans are short.
- Prioritize getting their email or mobile number early — don't spend several turns on other details first. Once you have it, you already have what matters most.
- If they try to wrap up before giving contact info, make ONE warm, low-pressure attempt to get at least an email or phone number before letting them go gracefully. Never guilt-trip or refuse to end the chat.
- Do not invent promises, discounts, prices, or guarantees you were not given. Do not diagnose their insurance needs or give specific policy advice — that is for a licensed follow-up call, not this chat.
- Do not be a pushover: if they dodge a question, gently redirect once, but don't loop on the same question forever.

Once you have an email or mobile number from them, do NOT immediately end the chat. Instead, ask a natural check-in like "Is there anything else I can help you with?" and keep "done": false for that turn (lead stays null). If they raise something else, help briefly, then check in again the same way. Only once they say no / that's all / nothing else should you wrap up: thank them warmly, let them know someone will follow up, and set "done": true with the lead fields filled in from whatever was shared during the conversation (contact is required; other fields can be null if not given).

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

// Extracts the first complete top-level JSON object from a string, tolerant
// of a stray preamble before it or trailing content after it (Gemini
// sometimes adds either even with JSON mode requested). Brace-counting
// (aware of string literals) finds the true matching closing brace, unlike
// a naive lastIndexOf("}") which can grab a later, unrelated brace and
// leave JSON.parse choking on trailing garbage.
function extractJsonObject(text) {
    const start = text.indexOf("{");
    if (start === -1) {
          throw new Error(`No JSON object found in Gemini response: ${text.slice(0, 120)}`);
    }
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    for (let i = start; i < text.length; i++) {
          const ch = text[i];
          if (inString) {
                  if (escapeNext) {
                            escapeNext = false;
                  } else if (ch === "\\") {
                            escapeNext = true;
                  } else if (ch === '"') {
                            inString = false;
                  }
                  continue;
          }
          if (ch === '"') {
                  inString = true;
          } else if (ch === "{") {
                  depth++;
          } else if (ch === "}") {
                  depth--;
                  if (depth === 0) {
                            return text.slice(start, i + 1);
                  }
          }
    }
    throw new Error(`Unterminated JSON object in Gemini response: ${text.slice(0, 120)}`);
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
                                            maxOutputTokens: 1024,
                                            // REST API field name is snake_case — see note in api/qualify.js history.
                                            response_mime_type: "application/json",
                                            // Newer Gemini models default to "thinking" (internal reasoning
                                            // tokens that count against maxOutputTokens). Left enabled, the
                                            // model can burn the entire token budget on reasoning and emit
                                            // nothing but a truncated "{" before hitting the limit. Disable
                                            // it so the budget goes to the actual JSON reply.
                                            thinkingConfig: { thinkingBudget: 0 },
                              },
                  }),
                  signal: controller.signal,
        }
            );

      clearTimeout(timeout);

      if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);

      const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      const parsed = JSON.parse(extractJsonObject(text));

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
