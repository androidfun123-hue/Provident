# Provident Financial Planning — Lead Qualification Widget

A lightweight AI-powered chat widget that qualifies website visitors and emails you a summary + urgency rating for each lead. No accounts, no database, no payments — built for personal use on your own site.

## What's in this folder

- widget.js — the embeddable chat widget (vanilla JS, no dependencies)
- api/qualify.js — serverless function: validates input, calls Claude for a summary, emails you the lead
- .env.example — template for your API keys
- vercel.json — deployment config
- test.html — a blank local test page for trying the widget before your real site is live

## Setup notes

Notification email and email-sender address are already configured in api/qualify.js. ALLOWED_ORIGIN is currently open ("*") since there is no live site domain yet — lock it down once your site is live.

In the Vercel dashboard for this project:
- Settings, Environment Variables: add ANTHROPIC_API_KEY and RESEND_API_KEY with your real values
- Redeploy so the function picks up the new env vars

## Embed on your website

Add this before the closing body tag of your site:

script src equals your deployed widget.js URL, with the defer attribute

- WordPress: use a plugin like "Insert Headers and Footers," or add it to your theme's footer.php
- Squarespace: Settings, Advanced, Code Injection, Footer
- Wix: Settings, Custom Code, Add Code to Footer
- Custom HTML site: paste directly into your HTML

## How it fails safely

- If the Claude API call fails or times out, you still get an email, just with a plain templated summary instead of an AI-written one.
- If email sending fails, the error is logged to your Vercel function logs so you can catch it.
- The visitor never sees an error either way.

## Cost

At personal-practice traffic levels: $0-2/month total.

## Rate limiting note

The current rate limiter is in-memory and resets whenever the serverless function cold-starts. Fine for casual abuse at low traffic; swap for Vercel KV if you see real spam volume.
