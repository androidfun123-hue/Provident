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
 */

(function () {
        "use strict";

   // ---- CONFIG: change this to your deployed API URL ----
   const API_ENDPOINT = "https://ai.providentfpsg.com/api/chat";

   	const GREETING =
                		"Hey there! 👋 I'm Provident's Smart Insurance Adviser — are you looking into insurance for your business or property (general insurance), or for yourself and your family (life & personal insurance)?";

   const TEASER_TEXT = "Ask our Smart Insurance Adviser — free, instant, no obligation.";
   const TEASER_DELAY_MS = 4000;

   const ERROR_REPLY =
             "Sorry, something went wrong on my end. Could you leave your name and the best way to reach you (email or phone)? Someone from Provident Financial Planning will follow up personally.";

   // ---- State ----
   let history = [];
        let conversationDone = false;
        let awaitingReply = false;

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
                                                                                                       }
                                                                                                       @keyframes pfp-teaser-in {
                                                                                                             from { opacity: 0; transform: translateY(6px); }
                                                                                                             to { opacity: 1; transform: translateY(0); }
                                                                                                       }
                                                                                                       #pfp-widget-panel {
                                                                   position: fixed; bottom: 92px; right: 20px; z-index: 999999;
                                                                         width: 400px; max-width: calc(100vw - 32px);
                                                                               height: min(640px, calc(100vh - 120px));
                                                                                     background: white; border-radius: 14px;
                                                                                           box-shadow: 0 10px 40px rgba(0,0,0,0.2); display: none;
                                                                                                 flex-direction: column; overflow: hidden;
                                                                                                       font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                                                                                           }
                                                                                                               #pfp-widget-panel.open { display: flex; }
                                                                                                                   #pfp-widget-header {
                                                                                                                         background: #1a3a5c; color: white; padding: 14px 18px;
                                                                                                                               font-weight: 600; font-size: 16px; display: flex;
                                                                                                                                     justify-content: space-between; align-items: center;
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
                                                                                                                                                                                                                                       border-top: 1px solid #e6e6e6; padding: 12px; display: flex; gap: 8px;
                                                                                                                                                                                                                                           }
                                                                                                                                                                                                                                               #pfp-widget-input-area input[type=text] {
                                                                                                                                                                                                                                                     flex: 1; border: 1px solid #ccc; border-radius: 8px;
                                                                                                                                                                                                                                                           padding: 11px; font-size: 16px; outline: none;
                                                                                                                                                                                                                                                               }
                                                                                                                                                                                                                                                                   #pfp-widget-input-area input[type=text]:disabled {
                                                                                                                                                                                                                                                                         background: #f5f5f5; color: #999;
                                                                                                                                                                                                                                                                             }
                                                                                                                                                                                                                                                                                 #pfp-widget-input-area button {
                                                                                                                                                                                                                                                                                       background: #1a3a5c; color: white; border: none; border-radius: 8px;
                                                                                                                                                                                                                                                                                             padding: 0 18px; font-size: 15px; cursor: pointer;
                                                                                                                                                                                                                                                                                                 }
                                                                                                                                                                                                                                                                                                     #pfp-widget-input-area button:disabled {
                                                                                                                                                                                                                                                                                                           background: #9aa8b5; cursor: default;
                                                                                                                                                                                                                                                                                                               }
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
                                       body: JSON.stringify({ history }),
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

   function openWidget() {
             dismissTeaser();
             document.getElementById("pfp-widget-panel").classList.add("open");
             if (history.length === 0) {
                         history.push({ role: "model", text: GREETING });
                         appendBotMessage(GREETING);
                         setInputEnabled(true);
             }
   }

   function closeWidget() {
             document.getElementById("pfp-widget-panel").classList.remove("open");
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
             teaser.onclick = (e) => {
                       if (e.target && e.target.id === "pfp-widget-teaser-close") {
                                   dismissTeaser();
                                   return;
                       }
                       dismissTeaser();
                       openWidget();
             };
             document.body.appendChild(teaser);
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
