// THEHELIGROUP — landing page interactions + chat widget.

// ---------- Hero video graceful fallback ----------
// If no <source> file loads (404, missing format, etc.), hide the video so the
// hero-media background image shows through. Without this, the empty <video>
// element can render as a black box on some browsers.
(() => {
  const heroVideo = document.querySelector(".hero-video");
  if (!heroVideo) return;
  const sources = heroVideo.querySelectorAll("source");
  let failed = 0;
  sources.forEach((s) => {
    s.addEventListener("error", () => {
      failed += 1;
      if (failed >= sources.length) heroVideo.classList.add("is-failed");
    });
  });
  // Also hide if the video itself errors out.
  heroVideo.addEventListener("error", () => heroVideo.classList.add("is-failed"));
  // If after 2.5s nothing has started loading, treat as failed.
  setTimeout(() => {
    if (heroVideo.readyState === 0) heroVideo.classList.add("is-failed");
  }, 2500);
})();

// ---------- Mobile nav ----------
const navToggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".nav");
navToggle?.addEventListener("click", () => nav.classList.toggle("is-open"));

// ---------- Smooth-scroll: close mobile nav on click ----------
document.querySelectorAll(".nav a").forEach((a) => {
  a.addEventListener("click", () => nav.classList.remove("is-open"));
});

// ---------- Chat widget ----------

const launcher = document.getElementById("chat-launcher");
const panel = document.getElementById("chat-panel");
const closeBtn = document.getElementById("chat-close");
const log = document.getElementById("chat-log");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const suggestions = document.getElementById("chat-suggestions");

const history = [];
const GREETING =
  "Hi — I'm the THEHELIGROUP assistant. Ask me about HELI145 maintenance, HELI147 training, our approvals, or how to get a quote.";

function openChat() {
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  launcher.classList.add("is-hidden");
  if (log.children.length === 0) addBubble("assistant", GREETING);
  setTimeout(() => input.focus(), 200);
}
function closeChat() {
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  launcher.classList.remove("is-hidden");
}

launcher?.addEventListener("click", openChat);
closeBtn?.addEventListener("click", closeChat);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && panel.classList.contains("is-open")) closeChat();
});

// ---------- Suggestion chips ----------
suggestions?.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  const prompt = btn.dataset.prompt;
  if (!prompt) return;
  suggestions.classList.add("is-hidden");
  input.value = prompt;
  form.requestSubmit();
});

// ---------- Bubbles ----------

function addBubble(role, text = "") {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function addTypingBubble() {
  const div = document.createElement("div");
  div.className = "bubble assistant is-typing";
  div.innerHTML = "<span></span><span></span><span></span>";
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

// ---------- Submit handler (SSE streaming) ----------

let inFlight = false;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (inFlight) return;

  const text = input.value.trim();
  if (!text) return;

  suggestions.classList.add("is-hidden");
  addBubble("user", text);
  history.push({ role: "user", content: text });
  input.value = "";

  inFlight = true;
  form.querySelector("button").disabled = true;

  const typing = addTypingBubble();
  let bubble = null;
  let assembled = "";

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });

    if (!resp.ok || !resp.body) throw new Error("network");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines.
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        let event = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          else if (line.startsWith("data: ")) data += line.slice(6);
        }
        if (!data) continue;

        let payload;
        try { payload = JSON.parse(data); } catch { continue; }

        if (event === "delta" && payload.text) {
          if (!bubble) {
            typing.remove();
            bubble = addBubble("assistant", "");
          }
          assembled += payload.text;
          bubble.textContent = assembled;
          log.scrollTop = log.scrollHeight;
        } else if (event === "error") {
          if (!bubble) { typing.remove(); bubble = addBubble("assistant", ""); }
          bubble.textContent = payload.message || "Sorry, something went wrong.";
        } else if (event === "done") {
          // stream complete
        }
      }
    }
  } catch (err) {
    console.error(err);
    typing.remove();
    bubble = addBubble(
      "assistant",
      "Sorry — I couldn't reach the server. Please email info@heli145.com (maintenance) or info@heli147.com (training) and we'll get back to you."
    );
    assembled = bubble.textContent;
  } finally {
    if (assembled) history.push({ role: "assistant", content: assembled });
    inFlight = false;
    form.querySelector("button").disabled = false;
    input.focus();
  }
});
