export const YOUR_NOTIFICATION_EMAIL = "provident.fun@gmail.com";

// Locked down: only these exact origins may call these APIs.
export const ALLOWED_ORIGINS = [
    "https://www.providentfpsg.com",
    "https://providentfpsg.com",
    "https://ai.providentfpsg.com",
    "https://lead-widget.vercel.app",
  ];

export function resolveAllowedOrigin(origin) {
    return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

export function applyCors(req, res) {
    const allowedOrigin = resolveAllowedOrigin(req.headers.origin);
    if (allowedOrigin) {
          res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
          res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return allowedOrigin;
}

export function getClientIp(req) {
    return req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
}

// Each serverless function file that calls this gets its own independent
// rate limiter instance (in-memory, resets on cold start) — fine for
// casual-abuse protection at low traffic.
export function createRateLimiter(perDay) {
    const store = new Map();
    return function isRateLimited(ip) {
          const now = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          const entry = store.get(ip);
          if (!entry || now - entry.windowStart > dayMs) {
                  store.set(ip, { count: 1, windowStart: now });
                  return false;
          }
          entry.count++;
          return entry.count > perDay;
    };
}

export async function sendLeadEmail(lead, aiSummary) {
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
                            subject: `[${(aiSummary.urgency || "warm").toUpperCase()}] New lead: ${
                                        lead.name || "Unknown"
                            } — ${lead.interest || "General enquiry"}`,
                            text: `New lead from your website chat widget.

                            Name: ${lead.name || "(not given)"}
                            Contact: ${lead.contact || "(not given)"}
                            Interest: ${lead.interest || "(not specified)"}
                            Existing coverage: ${lead.existing_coverage || "(not specified)"}
                            Timeline: ${lead.urgency_signal || "(not specified)"}
                            Notes: ${lead.notes || "(none)"}

                            --- AI Summary ---
                            ${aiSummary.summary || "(none)"}

                            Urgency: ${aiSummary.urgency || "warm"}
                            Suggested next step: ${aiSummary.suggested_next_step || "Review the conversation and follow up."}
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
