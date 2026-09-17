(function () {
    "use strict";

   const API_ENDPOINT = "https://lead-widget.vercel.app/api/qualify";

   const STEPS = [
     {
             id: "name",
             question: "Hi! I'm the Provident Financial Planning assistant. What's your name?",
             input: "text",
             placeholder: "Your name",
     },
     {
             id: "contact",
             question: "Thanks {name}! What's the best email or phone number to reach you?",
             input: "text",
             placeholder: "Email or phone",
     },
     {
             id: "interest",
             question: "What are you looking for help with?",
             options: ["Life insurance", "Health insurance", "Business insurance", "Financial planning", "Not sure yet"],
     },
     {
             id: "existing_coverage",
             question: "Do you currently have coverage in this area?",
             options: ["Yes", "No", "Not sure"],
     },
     {
             id: "urgency_signal",
             question: "How soon are you looking to sort this out?",
             options: ["Right away", "In the next few weeks", "Just exploring options"],
     },
     {
             id: "notes",
             question: "Anything else you'd like to share? (optional)",
             input: "text",
             placeholder: "Optional — press Send or skip",
             optional: true,
     },
       ];

   const CLOSING_MESSAGE =
         "Thanks {name} — got it! Someone from Provident Financial Planning will reach out within 24 hours. Have a great day!";

   let currentStepIndex = 0;
    let answers = {};

   const css = `
       #pfp-widget-bubble {
             position: fixed; bottom: 20px; right: 20px; z-index: 999999;
                   width: 60px; height: 60px; border-radius: 50%;
                         background: #1a3a5c; color: white; display: flex;
                               align-items: center; justify-content: center; cursor: pointer;
                                     box-shadow: 0 4px 14px rgba(0,0,0,0.25); font-size: 26px;
                                           transition: transform 0.15s ease;
                                                 font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                                     }
                                                         #pfp-widget-bubble:hover { transform: scale(1.06); }
                                                             #pfp-widget-panel {
                                                                   position: fixed; bottom: 92px; right: 20px; z-index: 999999;
                                                                         width: 340px; max-width: calc(100vw - 40px);
                                                                               max-height: 480px; background: white; border-radius: 14px;
                                                                                     box-shadow: 0 10px 40px rgba(0,0,0,0.2); display: none;
                                                                                           flex-direction: column; overflow: hidden;
                                                                                                 font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                                                                                     }
                                                                                                         #pfp-widget-panel.open { display: flex; }
                                                                                                             #pfp-widget-header {
                                                                                                                   background: #1a3a5c; color: white; padding: 14px 16px;
                                                                                                                         font-weight: 600; font-size: 15px; display: flex;
                                                                                                                               justify-content: space-between; align-items: center;
                                                                                                                                   }
                                                                                                                                       #pfp-widget-close { cursor: pointer; font-size: 18px; opacity: 0.85; }
                                                                                                                                           #pfp-widget-body {
                                                                                                                                                 flex: 1; overflow-y: auto; padding: 16px; font-size: 14px; color: #222;
                                                                                                                                                     }
                                                                                                                                                         .pfp-msg-bot {
                                                                                                                                                               background: #f0f3f7; padding: 10px 12px; border-radius: 10px;
                                                                                                                                                                     margin-bottom: 12px; line-height: 1.4; max-width: 90%;
                                                                                                                                                                         }
                                                                                                                                                                             .pfp-msg-user {
                                                                                                                                                                                   background: #1a3a5c; color: white; padding: 10px 12px;
                                                                                                                                                                                         border-radius: 10px; margin-bottom: 12px; margin-left: auto;
                                                                                                                                                                                               max-width: 80%; text-align: right; line-height: 1.4;
                                                                                                                                                                                                   }
                                                                                                                                                                                                       #pfp-widget-input-area {
                                                                                                                                                                                                             border-top: 1px solid #e6e6e6; padding: 10px; display: flex; gap: 8px;
                                                                                                                                                                                                                 }
                                                                                                                                                                                                                     #pfp-widget-input-area input[type=text] {
                                                                                                                                                                                                                           flex: 1; border: 1px solid #ccc; border-radius: 8px;
                                                                                                                                                                                                                                 padding: 10px; font-size: 16px; outline: none;
                                                                                                                                                                                                                                     }
                                                                                                                                                                                                                                         #pfp-widget-input-area button {
                                                                                                                                                                                                                                               background: #1a3a5c; color: white; border: none; border-radius: 8px;
                                                                                                                                                                                                                                                     padding: 0 16px; font-size: 14px; cursor: pointer;
                                                                                                                                                                                                                                                         }
                                                                                                                                                                                                                                                             .pfp-option-btn {
                                                                                                                                                                                                                                                                   display: block; width: 100%; text-align: left;
                                                                                                                                                                                                                                                                         background: white; border: 1px solid #1a3a5c; color: #1a3a5c;
                                                                                                                                                                                                                                                                               border-radius: 8px; padding: 9px 12px; margin-bottom: 8px;
                                                                                                                                                                                                                                                                                     font-size: 14px; cursor: pointer;
                                                                                                                                                                                                                                                                                         }
                                                                                                                                                                                                                                                                                             .pfp-option-btn:hover { background: #eef3f8; }
                                                                                                                                                                                                                                                                                               `;

   function injectStyles() {
         const style = document.createElement("style");
         style.textContent = css;
         document.head.appendChild(style);
   }

   function fillTemplate(str) {
         return str.replace(/\{(\w+)\}/g, (_, key) => answers[key] || "");
   }

   function appendBotMessage(text) {
         const body = document.getElementById("pfp-widget-body");
         const div = document.createElement("div");
         div.className = "pfp-msg-bot";
         div.textContent = fillTemplate(text);
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

   function renderInputArea(step) {
         const inputArea = document.getElementById("pfp-widget-input-area");
         inputArea.innerHTML = "";

      if (step.options) {
              const body = document.getElementById("pfp-widget-body");
              const wrap = document.createElement("div");
              step.options.forEach((opt) => {
                        const btn = document.createElement("button");
                        btn.className = "pfp-option-btn";
                        btn.textContent = opt;
                        btn.onclick = () => handleAnswer(step, opt);
                        wrap.appendChild(btn);
              });
              body.appendChild(wrap);
              body.scrollTop = body.scrollHeight;
              inputArea.style.display = "none";
      } else {
              inputArea.style.display = "flex";
              const input = document.createElement("input");
              input.type = "text";
              input.placeholder = step.placeholder || "";
              input.maxLength = 200;
              const sendBtn = document.createElement("button");
              sendBtn.textContent = step.optional ? "Send / Skip" : "Send";

           const submit = () => {
                     const val = input.value.trim();
                     if (!val && !step.optional) return;
                     handleAnswer(step, val || "(skipped)");
           };

           sendBtn.onclick = submit;
              input.addEventListener("keydown", (e) => {
                        if (e.key === "Enter") submit();
              });

           inputArea.appendChild(input);
              inputArea.appendChild(sendBtn);
              input.focus();
      }
   }

   function handleAnswer(step, value) {
         answers[step.id] = value;
         appendUserMessage(value);
         currentStepIndex++;
         advance();
   }

   function advance() {
         if (currentStepIndex >= STEPS.length) {
                 appendBotMessage(CLOSING_MESSAGE);
                 document.getElementById("pfp-widget-input-area").style.display = "none";
                 submitLead();
                 return;
         }
         const step = STEPS[currentStepIndex];
         appendBotMessage(step.question);
         renderInputArea(step);
   }

   function submitLead() {
         fetch(API_ENDPOINT, {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify(answers),
         }).catch(() => {
         });
   }

   function openWidget() {
         document.getElementById("pfp-widget-panel").classList.add("open");
         if (currentStepIndex === 0 && Object.keys(answers).length === 0) {
                 advance();
         }
   }

   function closeWidget() {
         document.getElementById("pfp-widget-panel").classList.remove("open");
   }

   function buildDOM() {
         const bubble = document.createElement("div");
         bubble.id = "pfp-widget-bubble";
         bubble.innerHTML = "💬";
         bubble.onclick = openWidget;

      const panel = document.createElement("div");
         panel.id = "pfp-widget-panel";
         panel.innerHTML = `
               <div id="pfp-widget-header">
                       <span>Provident Financial Planning</span>
                               <span id="pfp-widget-close">&times;</span>
                                     </div>
                                           <div id="pfp-widget-body"></div>
                                                 <div id="pfp-widget-input-area"></div>
                                                     `;

      document.body.appendChild(bubble);
         document.body.appendChild(panel);

      document.getElementById("pfp-widget-close").onclick = closeWidget;
   }

   function init() {
         injectStyles();
         buildDOM();
   }

   if (document.readyState === "loading") {
         document.addEventListener("DOMContentLoaded", init);
   } else {
         init();
   }
})();
