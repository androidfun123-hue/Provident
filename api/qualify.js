const YOUR_NOTIFICATION_EMAIL = "provident.fun@gmail.com";
const ALLOWED_ORIGINS = [
  "https://providentfpsg.com",
  "https://www.providentfpsg.com",
  "https://ai.providentfpsg.com",
  "https://lead-widget.vercel.app",
];
const RATE_LIMIT_PER_DAY = 20;

const rateLimitStore = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const entry = rateLimitStore.get(ip);
  if (!entry || now - entry.windowStart > dayMs) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_PER_DAY;
}

function validatePayload(body) {
  const errors = [];
  const allowedInterests = [
    "Life insurance",
    "Health insurance",
    "Business insurance",
    "Financial planning",
    "Not sure yet",
    ];
  const allowedCoverage = ["Yes", "No", "Not sure"];
  const allowedUrgency = ["Right away", "In the next few weeks", "Just exploring options"];

if (!body.name || typeof body.name !== "string" || body.name.length > 100) {
  errors.push("invalid name");
}
  if (!body.contact || typeof body.contact !== "string" || body.contact.length > 150) {
    errors.push("invalid contact");
  }
  if (!allowedInterests.includes(body.interest)) errors.push("invalid interest");
  if (!allowedCoverage.includes(body.existing_coverage)) errors.push("invalid existing_coverage");
  if (!allowedUrgency.includes(body.urgency_signal)) errors.push("invalid urgency_signal");
  if (body.notes && (typeof body.notes !== "string" || body.notes.length > 200)) {
    errors.push("notes too long");
  }

return errors;
}

function buildFallbackSummary(lead) {
  return {
    summary: `${lead.name} is interested in ${lead.interest}. Existing coverage: ${lead.existing_coverage}. Timeline: ${lead.urgency_signal}.`,
    urgency: lead.urgency_signal === "Right away" ? "hot" : "warm",
    suggested_next_step: "Review details and follow up directly.",
  };
}

const SYSTEM_PROMPT = `You are a lead-qualification assistant for an insurance/financial planning practice.
You will receive a visitor's answers to a fixed set of questions.
Your job: summarize the lead in 2-3 sentences, and assign an urgency tag.

Urgency tags (choose exactly one): "hot", "warm", "cold"
- hot: explicit urgency stated, or high-value need (e.g. business insurance, family with young dependents and no coverage)
- warm: general interest, no immediate urgency signal
- cold: vague interest, likely just browsing/comparing

Respond ONLY with valid JSON matching this exact schema, nothing else:
{
"summary": "string, 2-3 sentences, plain language",
"urgency": "hot" | "warm" | "cold",
"suggested_next_step": "string, one short sentence"
}

Do not include any text outside the JSON object. Do not speculate about coverage details or give advice — only summarize what was stated.`;

async function callClaudeForSummary(lead) {
  const userContent = JSON.stringify({
    name: lead.name,
    interest: lead.interest,
    existing_coverage: lead.existing_coverage,
    urgency_signal: lead.urgency_signal,
    notes: lead.notes || "",
  });

const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

try {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);

  const data = await response.json();
  const text = data.content?.find((b) => b.type === "text")?.text || "";
  const parsed = JSON.parse(text);

  const allowedUrgency = ["hot", "warm", "cold"];
  if (!allowedUrgency.includes(parsed.urgency)) parsed.urgency = "warm";
  if (!parsed.summary || !parsed.suggested_next_step) throw new Error("incomplete response");

  return parsed;
} catch (err) {
  clearTimeout(timeout);
  console.error("Claude summarization failed, using fallback:", err.message);
  return buildFallbackSummary(lead);
}
}

async function sendEmail(lead, aiResult) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Lead Widget <onboarding@resend.dev>",
        to: YOUR_NOTIFICATION_EMAIL,
        subject: `[${aiResult.urgency.toUpperCase()}] New lead: ${lead.name} — ${lead.interest}`,
        text: `New lead from your website widget.

        Name: ${lead.name}
        Contact: ${lead.contact}
        Interest: ${lead.interest}
        Existing coverage: ${lead.existing_coverage}
        Timeline: ${lead.urgency_signal}
        Notes: ${lead.notes || "(none)"}

        --- AI Summary ---
        ${aiResult.summary}

        Urgency: ${aiResult.urgency}
        Suggested next step: ${aiResult.suggested_next_step}
        `,
      }),
    });
    if (!res.ok) throw new Error(`Email send failed: ${res.status}`);
    return true;
  } catch (err) {
    console.error("EMAIL SEND FAILED — lead may be lost if not logged elsewhere:", err.message, lead);
    return false;
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const originAllowed = !origin || ALLOWED_ORIGINS.includes(origin);
  if (origin && originAllowed) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!originAllowed) return res.status(403).json({ error: "Origin not allowed" });

const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

const body = req.body;
  const errors = validatePayload(body);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Invalid input", details: errors });
  }

// IMPORTANT: we must finish the Claude + email work BEFORE responding.
// Vercel's Fluid compute runtime can freeze/suspend this function
// immediately after the response is sent, which was silently aborting
// the background fetch calls (and dropping leads without emailing them).
// Awaiting fully before responding guarantees the email attempt completes.
const aiResult = await callClaudeForSummary(body);
  const emailSent = await sendEmail(body, aiResult);

return res.status(200).json({ status: "received", emailSent });
}
