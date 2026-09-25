import { applyCors, getClientIp, createRateLimiter, sendLeadEmail } from "./_lib.js";

const RATE_LIMIT_PER_DAY = 60;
const MAX_USER_TURNS = 14;
const DEEPSEEK_MODEL = "deepseek-flash";

const isRateLimited = createRateLimiter(RATE_LIMIT_PER_DAY);

const SYSTEM_PROMPT = `You are a sharp, energetic insurance and financial-planning agent working a roadshow booth for Provident Financial Planning in Singapore. Someone just walked up to your booth and started chatting.

Provident covers two lines of business:
- General insurance: property & fire, marine, liability, work injury (WICA), motor, home, and travel.
- Personal & life insurance: life insurance, personal health/medical cover, critical illness, personal accident, and retirement/financial planning.

The visitor was already greeted and asked whether they're after general insurance or personal & life insurance — read their first reply to see which one they picked (or if they're not sure), and steer your questions down that track:
- General track: ask what they need to protect (business type, property, cargo, vehicles, etc.), whether they already have coverage, and how soon they need it sorted.
- Personal/life track: ask a bit about their situation (e.g. family, dependents, life stage) and which kind of personal cover they're thinking about, whether they already have coverage, and how soon they want to sort it out.
- If they say they're not sure or want both, that's fine — just note it and keep the conversation moving naturally.

Your main goal, above everything else: get a way to reach them — their email or mobile number. That is the one thing you must have before you can wrap up. Their name, which line of insurance they're after, what specifically they're interested in, whether they already have coverage, and how soon they want to sort it out are all nice to have for context, but never hold up the conversation chasing them — if they're vague or want to skip a question, move on.

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
                  "insurance_type": "general" or "personal" or "not sure" or null,
                          "interest": "string or null — the specific product or need, e.g. marine cargo or life insurance for a young family",
                          "existing_coverage": "string or null",
                              "urgency_signal": "string or null",
                                  "notes": "string or null — anything else relevant they mentioned"
                                    },
                                      "summary": "string or null — 2-3 plain-language sentences summarizing this lead for the agent who will follow up (only when done is true)",
                                        "urgency": "hot" or "warm" or "cold" or null (only when done is true),
                                          "suggested_next_step": "string or null — one short sentence (only when done is true)"
                                          }

                                          Set "lead", "summary", "urgency" and "suggested_next_step" to null while done is false.`;

// DeepSeek's chat completions API is OpenAI-style: messages use
// role "user"/"assistant" (not Gemini's "model"), and content is a plain
// string (not Gemini's parts array).
function toDeepseekMessages(history) {
    return history
      .filter((m) => m && typeof m.text === "string" && (m.role === "user" || m.role === "model"))
      .slice(-40)
      .map((m) => ({
              role: m.role === "model" ? "assistant" : "user",
              content: String(m.text).slice(0, 1000),
      }));
}

// Extracts the first complete top-level JSON object from a string, tolerant
// of a stray preamble before it or trailing content after it (some models
// add either even with JSON mode requested). Brace-counting (aware of
// string literals) finds the true matching closing brace, unlike a naive
// lastIndexOf("}") which can grab a later, unrelated brace and leave
// JSON.parse choking on trailing garbage.
function extractJsonObject(text) {
    const start = text.indexOf("{");
    if (start === -1) {
          throw new Error(`No JSON object found in model response: ${text.slice(0, 120)}`);
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
    throw new Error(`Unterminated JSON object in model response: ${text.slice(0, 120)}`);
}

function fallbackResponse() {
    return {
          reply:
                  "Sorry, I'm having a little trouble on my end right now — could you leave your name and the best way to reach you (email or phone)? Someone from Provident Financial Planning will follow up personally.",
          done: false,
          emailSent: null,
    };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// One attempt at calling DeepSeek and parsing its reply. Throws on any
// failure (network error, non-2xx, malformed/missing JSON) so the caller
// can retry.
async function callDeepseek(systemText, history, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
        const response = await fetch("https://api.deepseek.com/chat/completions", {
              method: "POST",
              headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
              },
              body: JSON.stringify({
                          model: DEEPSEEK_MODEL,
                          messages: [{ role: "system", content: systemText }, ...toDeepseekMessages(history)],
                          response_format: { type: "json_object" },
                          max_tokens: 1024,
                          // Thinking mode is on by default and can burn the whole token
                          // budget on internal reasoning, leaving nothing for the actual
                          // JSON reply (same failure mode Gemini has with its "thinking"
                          // feature). Disable it so the budget goes to the reply itself.
                          thinking: { type: "disabled" },
              }),
              signal: controller.signal,
        });

      if (!response.ok) {
              const bodyText = await response.text().catch(() => "");
              throw new Error(`DeepSeek API error: ${response.status} ${bodyText.slice(0, 200)}`);
      }

      const data = await response.json();
        const text = data.choices?.[0]?.message?.content || "";

      const parsed = JSON.parse(extractJsonObject(text));

      if (!parsed.reply || typeof parsed.reply !== "string") {
              throw new Error("Missing reply field in DeepSeek response");
      }

      return parsed;
  } finally {
        clearTimeout(timeout);
  }
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

  const systemText = forceWrapUp
        ? `${SYSTEM_PROMPT}\n\nIMPORTANT: This conversation has gone on long enough. In your reply now, wrap up warmly, thank them, and set "done": true with your best-effort lead fields even if some are incomplete.`
      : SYSTEM_PROMPT;

  // APIs occasionally have transient hiccups (brief overload, rate-limit
  // blips). DeepSeek specifically has a documented quirk where its JSON
  // mode can return genuinely empty content, and this has been observed
  // happening twice in a row for the same request. Retry up to 2 times
  // (3 attempts total) with a short backoff before giving up, so a real
  // visitor isn't dumped into the fallback reply by a short unlucky streak.
  // Each attempt gets its own timeout budget so three attempts plus backoff
  // comfortably fit inside the function's maxDuration (see vercel.json).
  const MAX_ATTEMPTS = 3;
    const ATTEMPT_TIMEOUT_MS = 6000;
    const RETRY_BACKOFF_MS = 400;

  let parsed = null;
    let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
                parsed = await callDeepseek(systemText, history, ATTEMPT_TIMEOUT_MS);
                break;
        } catch (err) {
                lastErr = err;
                console.error(`Chat turn attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err.message);
                if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BACKOFF_MS);
        }
  }

  if (!parsed) {
        console.error("Chat turn failed after retries, using fallback reply:", lastErr?.message);
        return res.status(200).json(fallbackResponse());
  }

  try {
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
        // The model call succeeded; only the (non-critical) email send
        // failed. Still deliver the reply to the visitor rather than
        // falling back.
        console.error("Lead email failed to send:", err.message);
        return res.status(200).json({
              reply: parsed.reply,
              done: !!parsed.done,
              emailSent: false,
        });
  }
}
