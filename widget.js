/**
 * Provident Financial Planning — AI Lead Qualification Widget
 * Drop-in script: <script src="https://ai.providentfpsg.com/widget.js" defer></script>
 *
 * No dependencies. Vanilla JS. Renders a fixed chat bubble that opens a
 * live AI-driven conversation (powered by Gemini via /api/chat), which
 * probes for lead details the way a real agent would, then emails the
 * qualified lead once the conversation wraps up.
 *
 * Also exposes window.PFPWidget = { open, close } so other elements on
 * the page (e.g. a "Talk to us" button) can open the same chat panel.
 * PFPWidget.open() optionally takes a context object — e.g. from the CPF
 * calculator page — which tailors the opening greeting and is sent along
 * with every chat turn so the AI (and the lead email) knows what the
 * visitor already worked out for themselves before opening the chat.
 *
 * The AI's replies can also suggest a short list of "quick_replies" —
 * tappable answer options rendered as chips under its message, so the
 * visitor can answer common questions (which track, yes/no, a rough
 * timeline) with one tap instead of typing.
 */

(function () {
        "use strict";

   // ---- CONFIG: change this to your deployed API URL ----
   const API_ENDPOINT = "https://ai.providentfpsg.com/api/chat";

   	const GREETING =
                		"Hey there! 👋 I'm Provident's Smart Insurance Adviser — are you looking into insurance for your business or property (general insurance), or for yourself and your family (life & personal insurance)?";
   const GREETING_QUICK_REPLIES = ["General / business insurance", "Personal & life insurance", "Not sure yet"];

   const TEASER_TEXT = "Ask our Smart Insurance Adviser — free, instant, no obligation.";
   const TEASER_DELAY_MS = 4000;

   const ERROR_REPLY =
             "Sorry, something went wrong on my end. Could you leave your name and the best way to reach you (email or phone)? Someone from Provident Financial Planning will follow up personally.";

   // ---- State ----
   let history = [];
        let conversationDone = false;
        let awaitingReply = false;
   // Optional context passed in via PFPWidget.open(context) when opened
   // from a page like the CPF calculator -- e.g.
   // { source: "cpf-calculator", age, monthlyPayout, ... }. Sent along with
   // every /api/chat request so the AI can tailor its questions (and the
   // lead email) around what the visitor already told the calculator,
   // instead of starting from zero.
   let pageContext = null;

   // Builds the first message shown when the panel opens with an empty
   // history. Falls back to the generic GREETING when no usable context
   // was passed in (or the page didn't pass one at all).
   function buildGreeting(context) {
             if (context && context.source === "cpf-calculator" && typeof context.monthlyPayout === "number") {
                       var payoutStr = "$" + Math.round(context.monthlyPayout).toLocaleString("en-US");
                       var payoutLine = context.belowBRS
                                 ? "right now you're tracking below the Basic Retirement Sum, with an estimated payout around " + payoutStr + "/month if nothing changes"
                                 : "you're on track for an estimated CPF LIFE payout of about " + payoutStr + "/month from age " + (context.payoutAge || 65);
                       return {
                                 text: "Hey there! 👋 Looks like you were just checking your CPF numbers — based on what you entered, " + payoutLine + ". Want to chat about ways to plan around that, or is there something else on your mind?",
                                 quickReplies: ["Help me plan around this", "Just exploring for now", "I have a different question"],
                       };
             }
             return { text: GREETING, quickReplies: GREETING_QUICK_REPLIES };
   }

   // ---- Styles (scoped, injected once) ----
   const css = `
       #pfp-widget-bubble {
             position: fixed; bottom: 20px; right: 20px; z-index: 999999;
                   width: 64px; height: 64px; border-radius: 50%;
                         background: #1a3a5c; color: white; display: flex;
                               align-items: center; justify-content: center; cursor: pointer;
                                     box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 0 rgba(31,157,107,0.5); font-size: 28px;
                                           transition: transform 0.15s ease;
                                                 font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                                     animation: pfp-pulse 2.6s ease-out 1.5s 3;
                                                     }
                                                         #pfp-widget-bubble:hover { transform: scale(1.06); }
                                                             @keyframes pfp-pulse {
                                                                   0% { box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 0 0 rgba(31,157,107,0.55); }
                                                                   70% { box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 0 14px rgba(31,157,107,0); }
                                                                   100% { box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 0 0 rgba(31,157,107,0); }
                                                             }
                                                             #pfp-widget-teaser {
                                                                   position: fixed; bottom: 30px; right: 92px; z-index: 999998;
                                                                         max-width: 240px; background: white; color: #1a3a5c;
                                                                               padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.4;
                                                                                     box-shadow: 0 6px 20px rgba(0,0,0,0.18); cursor: pointer;
                                                                                           font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                                                                                 display: flex; align-items: flex-start; gap: 8px;
                                                                                                       animation: pfp-teaser-in 0.25s ease-out;
                                                                                                       }
                                                                                                       #pfp-widget-teaser:hover { transform: translateY(-1px); }
                                                                                                       #pfp-widget-teaser-close {
                                                                                                             color: #99a; font-size: 15px; line-height: 1; cursor: pointer; flex-shrink: 0;
                                                                                                             display: flex; align-items: center; justify-content: center;
                                                                                                             width: 32px; height: 32px; margin: -8px -8px -8px 0;
                                                                                                             -webkit-tap-highlight-color: transparent;
                                                                                                       }
                                                                                                       @keyframes pfp-teaser-in {
                                                                                                             from { opacity: 0; transform: translateY(6px); }
                                                                                                             to { opacity: 1; transform: translateY(0); }
                                                                                                       }
                                                                                                       #pfp-widget-panel {
                                                                   position: fixed; bottom: 92px; right: 20px; z-index: 999999;
                                                                         width: 400px; max-width: calc(100vw - 32px);
                                                                               height: min(640px, calc(100vh - 120px));
                                                                               height: min(640px, calc(100dvh - 120px));
                                                                                     background: white; border-radius: 14px;
                                                                                           box-shadow: 0 10px 40px rgba(0,0,0,0.2); display: none;
                                                                                                 flex-direction: column; overflow: hidden;
                                                                                                       font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                                                                                           }
                                                                                                               #pfp-widget-panel.open { display: flex; }
                                                                                                               @media (max-width: 640px), (max-height: 480px) {
                                                                                                                 #pfp-widget-panel {
                                                                                                                   top: 0; left: 0; right: 0; bottom: 0;
                                                                                                                   width: 100%; max-width: 100%;
                                                                                                                   height: 100vh; height: 100dvh;
                                                                                                                   border-radius: 0;
                                                                                                                 }
                                                                                                                 #pfp-widget-header { padding-top: max(14px, env(safe-area-inset-top)); }
                                                                                                                 #pfp-widget-input-area { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
                                                                                                               }
                                                                                                                   #pfp-widget-header {
                                                                                                                         background: #1a3a5c; color: white; padding: 14px 18px;
                                                                                                                               font-weight: 600; font-size: 16px; display: flex;
                                                                                                                                     justify-content: space-between; align-items: center;
                                                                                                                                     flex-shrink: 0;
                                                                                                                                         }
                                                                                                                                             #pfp-widget-header small { display: block; font-weight: 400; font-size: 12px; color: #c9d6e6; margin-top: 2px; }
                                                                                                                                             #pfp-widget-close { cursor: pointer; font-size: 20px; opacity: 0.85; }
                                                                                                                                                 #pfp-widget-body {
                                                                                                                                                       flex: 1; overflow-y: auto; padding: 18px; font-size: 15px; color: #222;
                                                                                                                                                           }
                                                                                                                                                               .pfp-msg-bot {
                                                                                                                                                                     background: #f0f3f7; padding: 11px 14px; border-radius: 10px;
                                                                                                                                                                           margin-bottom: 14px; line-height: 1.45; max-width: 90%;
                                                                                                                                                                               }
                                                                                                                                                                                   .pfp-msg-user {
                                                                                                                                                                                         background: #1a3a5c; color: white; padding: 11px 14px;
                                                                                                                                                                                               border-radius: 10px; margin-bottom: 14px; margin-left: auto;
                                                                                                                                                                                                     max-width: 80%; text-align: right; line-height: 1.45;
                                                                                                                                                                                                         }
                                                                                                                                                                                                             .pfp-msg-typing {
                                                                                                                                                                                                                   background: #f0f3f7; padding: 11px 14px; border-radius: 10px;
                                                                                                                                                                                                                         margin-bottom: 14px; max-width: 90%; color: #888; font-style: italic;
                                                                                                                                                                                                                             }
                                                                                                                                                                                                                                 #pfp-widget-input-area {
                                                                                                                                                                                                                                       border-top: 1px solid #e6e6e6; padding: 12px; display: flex; gap: 8px; box-sizing: border-box;
                                                                                                                                                                                                                                           }
                                                                                                                                                                                                                                               #pfp-widget-input-area input[type=text] {
                                                                                                                                                                                                                                                     flex: 1 1 auto; min-width: 0; border: 1px solid #ccc; border-radius: 8px;
                                                                                                                                                                                                                                                           padding: 11px; font-size: 16px; outline: none; box-sizing: border-box;
                                                                                                                                                                                                                                                               }
                                                                                                                                                                                                                                                                   #pfp-widget-input-area input[type=text]:disabled {
                                                                                                                                                                                                                                                                         background: #f5f5f5; color: #999;
                                                                                                                                                                                                                                                                             }
                                                                                                                                                                                                                                                                                 #pfp-widget-input-area button {
                                                                                                                                                                                                                                                                                       background: #1a3a5c; color: white; border: none; border-radius: 8px;
                                                                                                                                                                                                                                                                                             padding: 0 18px; font-size: 15px; cursor: pointer;
                                                                                                                                                                                                                                                                                                   flex-shrink: 0; white-space: nowrap; box-sizing: border-box;
                                                                                                                                                                                                                                                                                                 }
                                                                                                                                                                                                                                                                                                     #pfp-widget-input-area button:disabled {
                                                                                                                                                                                                                                                                                                           background: #9aa8b5; cursor: default;
                                                                                                                                                                                                                                                                                                               }
                                                                                                                                                                                                                                                                                                                 .pfp-quick-replies {
                                                                                                                                                                                                                                                                                                       display: flex; flex-wrap: wrap; gap: 8px; margin: -6px 0 14px;
                                                                                                                                                                                                                                                                                                     }
                                                                                                                                                                                                                                                                                                     .pfp-quick-reply-btn {
                                                                                                                                                                                                                                                                                                       background: white; color: #1a3a5c; border: 1.5px solid #1a3a5c;
                                                                                                                                                                                                                                                                                                       border-radius: 999px; padding: 7px 14px; font-size: 13.5px;
                                                                                                                                                                                                                                                                                                       cursor: pointer; font-family: inherit; line-height: 1.3;
                                                                                                                                                                                                                                                                                                       transition: background 0.12s ease, color 0.12s ease;
                                                                                                                                                                                                                                                                                                     }
                                                                                                                                                                                                                                                                                                     .pfp-quick-reply-btn:hover { background: #1a3a5c; color: white; }
                                                                                                                                                                                                                                                                                                     .pfp-quick-reply-btn:disabled { opacity: 0.5; cursor: default; }
                                                                                                                                                                                                                                                                                                     `;

   function injectStyles() {
             const style = document.createElement("style");
             style.textContent = css;
             document.head.appendChild(style);
   }

   function appendBotMessage(text) {
             const body = document.getElementById("pfp-widget-body");
             const div = document.createElement("div");
             div.className = "pfp-msg-bot";
             div.textContent = text;
             body.appendChild(div);
             body.scrollTop = body.scrollHeight;
   }

   function appendUserMessage(text) {
             const body = document.getElementById("pfp-widget-body");
             const div = document.createElement("div");
             div.className = "pfp-msg-user";
             div.textContent = text;
             body.appendChild(div);
             body.scrollTop = body.scrollHeight;
   }

   function showTyping() {
             const body = document.getElementById("pfp-widget-body");
             const div = document.createElement("div");
             div.className = "pfp-msg-typing";
             div.id = "pfp-typing-indicator";
             div.textContent = "Typing…";
             body.appendChild(div);
             body.scrollTop = body.scrollHeight;
   }

   function hideTyping() {
             const el = document.getElementById("pfp-typing-indicator");
             if (el) el.remove();
   }

   function clearQuickReplies() {
             const el = document.getElementById("pfp-quick-replies");
             if (el) el.remove();
   }

   function renderQuickReplies(options) {
             clearQuickReplies();
             if (!Array.isArray(options) || options.length === 0) return;
             const body = document.getElementById("pfp-widget-body");
             const container = document.createElement("div");
             container.className = "pfp-quick-replies";
             container.id = "pfp-quick-replies";
             options.slice(0, 4).forEach((opt) => {
                       if (typeof opt !== "string" || !opt.trim()) return;
                       const btn = document.createElement("button");
                       btn.type = "button";
                       btn.className = "pfp-quick-reply-btn";
                       btn.textContent = opt;
                       btn.onclick = () => {
                                 if (awaitingReply || conversationDone) return;
                                 clearQuickReplies();
                                 sendMessage(opt);
                       };
                       container.appendChild(btn);
             });
             body.appendChild(container);
             body.scrollTop = body.scrollHeight;
   }

   function setInputEnabled(enabled) {
             const input = document.getElementById("pfp-widget-text-input");
             const button = document.getElementById("pfp-widget-send-btn");
             if (input) {
                         input.disabled = !enabled;
                         if (enabled) input.focus();
             }
             if (button) button.disabled = !enabled;
   }

   function endConversationUI() {
             conversationDone = true;
             setInputEnabled(false);
             const input = document.getElementById("pfp-widget-text-input");
             if (input) input.placeholder = "Conversation ended — thanks for chatting!";
   }

   async function sendMessage(userText) {
             clearQuickReplies();
             history.push({ role: "user", text: userText });
             appendUserMessage(userText);

          awaitingReply = true;
             setInputEnabled(false);
             showTyping();

          let data;
             try {
                         const res = await fetch(API_ENDPOINT, {
                                       method: "POST",
                                       headers: { "Content-Type": "application/json" },
                                       body: JSON.stringify({ history, context: pageContext }),
                         });
                         data = await res.json();
                         if (!data || typeof data.reply !== "string") throw new Error("bad response");
             } catch (err) {
                         data = { reply: ERROR_REPLY, done: false };
             }

          hideTyping();
             awaitingReply = false;

          history.push({ role: "model", text: data.reply });
             appendBotMessage(data.reply);

          if (data.done) {
                      endConversationUI();
          } else {
                      setInputEnabled(true);
                      if (Array.isArray(data.quickReplies) && data.quickReplies.length > 0) {
                                  renderQuickReplies(data.quickReplies);
                      }
          }
   }

   function handleSubmit() {
             if (awaitingReply || conversationDone) return;
             const input = document.getElementById("pfp-widget-text-input");
             const val = input.value.trim();
             if (!val) return;
             input.value = "";
             sendMessage(val);
   }

   function renderInputArea() {
             const inputArea = document.getElementById("pfp-widget-input-area");
             inputArea.innerHTML = "";

          const input = document.createElement("input");
             input.type = "text";
             input.id = "pfp-widget-text-input";
             input.placeholder = "Type your reply…";
             input.maxLength = 300;
             input.setAttribute("enterkeyhint", "send");
             input.setAttribute("autocomplete", "off");
             input.addEventListener("focus", () => {
                       if (isMobilePanel()) lockPageZoom();
                       // iOS keyboard animates in over ~250-300ms; re-sync after it
                       // settles so the input + latest message stay in view.
                       setTimeout(syncPanelToViewport, 50);
                       setTimeout(syncPanelToViewport, 350);
             });
             input.addEventListener("blur", () => {
                       unlockPageZoom();
             });

          const sendBtn = document.createElement("button");
             sendBtn.id = "pfp-widget-send-btn";
             sendBtn.textContent = "Send";

          sendBtn.onclick = handleSubmit;
             input.addEventListener("keydown", (e) => {
                         if (e.key === "Enter") handleSubmit();
             });

          inputArea.appendChild(input);
             inputArea.appendChild(sendBtn);
   }

   // ---- Mobile keyboard handling ----
   // On iOS Safari, a fixed-position panel does NOT resize or reposition
   // when the on-screen keyboard opens — only the "visual viewport" shrinks.
   // Left alone, this pushes the input (and sometimes the whole panel) up
   // behind the keyboard, or lets the underlying page scroll out from under
   // the fixed panel. We track window.visualViewport and resize the panel
   // to match the actually-visible area, and pin the background page so it
   // can't scroll while the panel is open.
   let vvCleanup = null;

   function isMobilePanel() {
             return window.matchMedia("(max-width: 640px), (max-height: 480px)").matches;
   }

   // iOS Safari can still auto-zoom the whole page when a form field is
   // focused inside a repositioned fixed-position panel like ours, even
   // with a 16px font-size on the input. Temporarily pin the page's zoom
   // level while the widget's input is focused (and restore normal
   // pinch-zoom on blur, so we don't disable accessibility zoom globally).
   let savedViewportContent = null;

   function lockPageZoom() {
             const meta = document.querySelector('meta[name="viewport"]');
             if (!meta) return;
             if (savedViewportContent === null) savedViewportContent = meta.getAttribute("content") || "";
             meta.setAttribute(
                       "content",
                       "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
             );
   }

   function unlockPageZoom() {
             const meta = document.querySelector('meta[name="viewport"]');
             if (!meta || savedViewportContent === null) return;
             meta.setAttribute("content", savedViewportContent);
   }

   function lockBodyScroll() {
             const scrollY = window.scrollY || window.pageYOffset || 0;
             document.body.dataset.pfpScrollY = String(scrollY);
             document.body.style.position = "fixed";
             document.body.style.top = `-${scrollY}px`;
             document.body.style.left = "0";
             document.body.style.right = "0";
             document.body.style.width = "100%";
   }

   function unlockBodyScroll() {
             if (document.body.dataset.pfpScrollY === undefined) return;
             const scrollY = parseInt(document.body.dataset.pfpScrollY, 10) || 0;
             document.body.style.position = "";
             document.body.style.top = "";
             document.body.style.left = "";
             document.body.style.right = "";
             document.body.style.width = "";
             delete document.body.dataset.pfpScrollY;
             window.scrollTo(0, scrollY);
   }

   function syncPanelToViewport() {
             const panel = document.getElementById("pfp-widget-panel");
             const vv = window.visualViewport;
             if (!panel || !vv || !isMobilePanel()) return;
             panel.style.height = vv.height + "px";
             panel.style.top = vv.offsetTop + "px";
             panel.style.bottom = "auto";
             const body = document.getElementById("pfp-widget-body");
             if (body) body.scrollTop = body.scrollHeight;
   }

   function startViewportTracking() {
             if (!window.visualViewport || vvCleanup) return;
             const handler = () => syncPanelToViewport();
             window.visualViewport.addEventListener("resize", handler);
             window.visualViewport.addEventListener("scroll", handler);
             vvCleanup = () => {
                       window.visualViewport.removeEventListener("resize", handler);
                       window.visualViewport.removeEventListener("scroll", handler);
             };
             syncPanelToViewport();
   }

   function stopViewportTracking() {
             if (vvCleanup) {
                       vvCleanup();
                       vvCleanup = null;
             }
             const panel = document.getElementById("pfp-widget-panel");
             if (panel) {
                       panel.style.height = "";
                       panel.style.top = "";
                       panel.style.bottom = "";
             }
   }

   function openWidget(context) {
             if (context && typeof context === "object") pageContext = context;
             dismissTeaser();
             document.getElementById("pfp-widget-panel").classList.add("open");
             if (isMobilePanel()) {
                       lockBodyScroll();
                       startViewportTracking();
             }
             if (history.length === 0) {
                         const greeting = buildGreeting(pageContext);
                         history.push({ role: "model", text: greeting.text });
                         appendBotMessage(greeting.text);
                         setInputEnabled(true);
                         if (greeting.quickReplies) renderQuickReplies(greeting.quickReplies);
             }
   }

   function closeWidget() {
             document.getElementById("pfp-widget-panel").classList.remove("open");
             stopViewportTracking();
             unlockBodyScroll();
             unlockPageZoom();
   }

   function dismissTeaser() {
             const el = document.getElementById("pfp-widget-teaser");
             if (el) el.remove();
   }

   function showTeaser() {
             if (document.getElementById("pfp-widget-panel").classList.contains("open")) return;
             if (document.getElementById("pfp-widget-teaser")) return;
             const teaser = document.createElement("div");
             teaser.id = "pfp-widget-teaser";
             teaser.innerHTML = `<span>${TEASER_TEXT}</span><span id="pfp-widget-teaser-close">&times;</span>`;
             teaser.onclick = () => {
                       dismissTeaser();
                       openWidget();
             };
             document.body.appendChild(teaser);
             // Give the close "x" its own handler with stopPropagation, rather
             // than relying on the parent's onclick to sniff e.target — on a
             // small touch target, a near-miss tap was landing on the parent
             // and opening the chat instead of dismissing the teaser.
             const closeBtn = document.getElementById("pfp-widget-teaser-close");
             if (closeBtn) {
                       closeBtn.addEventListener("click", (e) => {
                                 e.stopPropagation();
                                 dismissTeaser();
                       });
             }
   }

   function buildDOM() {
             const bubble = document.createElement("div");
             bubble.id = "pfp-widget-bubble";
             bubble.innerHTML = "💬";
             bubble.onclick = () => {
                       dismissTeaser();
                       openWidget();
             };

          const panel = document.createElement("div");
             panel.id = "pfp-widget-panel";
             panel.innerHTML = `
                   <div id="pfp-widget-header">
                           <span>Smart Insurance Adviser<small>Provident Financial Planning</small></span>
                                   <span id="pfp-widget-close">&times;</span>
                                         </div>
                                               <div id="pfp-widget-body"></div>
                                                     <div id="pfp-widget-input-area"></div>
                                                         `;

          document.body.appendChild(bubble);
             document.body.appendChild(panel);

          document.getElementById("pfp-widget-close").onclick = closeWidget;
             renderInputArea();
   }

   function init() {
             injectStyles();
             buildDOM();
             // Let other elements on the page (e.g. a "Talk to us" button) open
          // this same chat panel instead of linking elsewhere.
          window.PFPWidget = { open: openWidget, close: closeWidget };
          setTimeout(showTeaser, TEASER_DELAY_MS);
   }

   if (document.readyState === "loading") {
             document.addEventListener("DOMContentLoaded", init);
   } else {
             init();
   }
})();
