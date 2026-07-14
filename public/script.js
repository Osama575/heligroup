// THEHELIGROUP — landing page interactions + chat widget.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Theme toggle ----------
(() => {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const themeBg = { dark: "#0e1420", light: "#f2f4f8" };

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    try { localStorage.setItem("hg-theme", theme); } catch (e) {}
    if (meta) meta.setAttribute("content", themeBg[theme] || themeBg.dark);
  }

  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      apply(next);
    });
  });
})();

// ---------- Header: condense on scroll ----------
(() => {
  const header = document.querySelector("[data-header]");
  if (!header) return;
  let ticking = false;
  const update = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 40);
    ticking = false;
  };
  update();
  window.addEventListener("scroll", () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
})();

// ---------- Hero parallax ----------
(() => {
  const img = document.querySelector(".hero-img[data-parallax]");
  const hero = document.querySelector(".hero");
  if (!img || !hero || reduceMotion) return;
  let ticking = false;
  const update = () => {
    const rect = hero.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) {
      const shift = Math.min(window.scrollY, hero.offsetHeight) * 0.18;
      img.style.transform = `translate3d(0, ${shift}px, 0) scale(1.06)`;
    }
    ticking = false;
  };
  update();
  window.addEventListener("scroll", () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
})();

// ---------- Scroll reveal ----------
(() => {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;

  if (!("IntersectionObserver" in window) || reduceMotion) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

  items.forEach((el) => io.observe(el));

  // Safety net: if anything is still hidden after load (e.g. a non-scrolling
  // headless render), reveal it so content is never stuck invisible.
  window.addEventListener("load", () => {
    setTimeout(() => {
      document.querySelectorAll("[data-reveal]:not(.is-visible)").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) el.classList.add("is-visible");
      });
    }, 600);
  });
})();

// ---------- Scroll-spy: active nav link ----------
(() => {
  const links = Array.from(document.querySelectorAll('.nav a[href^="#"]'));
  if (!links.length || !("IntersectionObserver" in window)) return;
  const map = new Map();
  links.forEach((a) => {
    const id = a.getAttribute("href").slice(1);
    const sec = document.getElementById(id);
    if (sec) map.set(sec, a);
  });
  if (!map.size) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        links.forEach((l) => l.classList.remove("active"));
        const active = map.get(entry.target);
        if (active) active.classList.add("active");
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });

  map.forEach((_, sec) => io.observe(sec));
})();

// ---------- Mobile nav ----------
const navToggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".nav");

navToggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  navToggle.classList.toggle("is-active", open);
  navToggle.setAttribute("aria-expanded", String(open));
  if (!open) {
    document.querySelectorAll(".has-dropdown.is-open").forEach((li) => li.classList.remove("is-open"));
  }
});

// ---------- Mobile dropdown toggle ----------
document.querySelectorAll(".has-dropdown > a").forEach((a) => {
  a.addEventListener("click", (e) => {
    if (window.innerWidth > 860) return; // desktop uses CSS hover
    e.preventDefault();
    const li = a.closest(".has-dropdown");
    const isNowOpen = !li.classList.contains("is-open");
    document.querySelectorAll(".has-dropdown.is-open").forEach((other) => other.classList.remove("is-open"));
    li.classList.toggle("is-open", isNowOpen);
    a.setAttribute("aria-expanded", String(isNowOpen));
  });
});

// ---------- Close mobile nav on link click ----------
document.querySelectorAll(".nav a").forEach((a) => {
  a.addEventListener("click", () => {
    if (a.closest(".has-dropdown") && window.innerWidth <= 860) return; // handled above
    nav.classList.remove("is-open");
    navToggle?.classList.remove("is-active");
    navToggle?.setAttribute("aria-expanded", "false");
    document.querySelectorAll(".has-dropdown.is-open").forEach((li) => li.classList.remove("is-open"));
  });
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

// Any "Talk to the team" / "Start a chat" CTA opens the widget.
document.querySelectorAll("[data-open-chat]").forEach((btn) => {
  btn.addEventListener("click", openChat);
});

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
