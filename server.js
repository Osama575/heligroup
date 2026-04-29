// THEHELIGROUP demo — Express server proxying chat to the Claude API.
//
// The /api/chat endpoint runs a tool-use loop: the model can call
// get_calendar_availability and create_booking. Tool round-trips are handled
// server-side; the client just sees streamed text deltas + a done event.
//
// Setup:
//   1. cp .env.example .env  (and fill in keys, see .env for the full list)
//   2. npm install
//   3. npm start
//   4. open http://localhost:3000

import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "url";
import path from "path";

import { SYSTEM_PROMPT } from "./business-context.js";
import { TOOLS, dispatchTool } from "./lib/tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_TOOL_TURNS = 6; // hard cap so a buggy loop can't run away

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("\n  Missing ANTHROPIC_API_KEY in .env — copy .env.example to .env and add your key.\n");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const app = express();

app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Convert a {role, content:string} client message into the Anthropic content-block format.
function clientToApiMessage(m) {
  return {
    role: m.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: String(m.content ?? "").slice(0, 4000) }],
  };
}

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }

  // Keep context bounded — last 20 turns from the visitor side.
  const apiMessages = messages.slice(-20).map(clientToApiMessage);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let turn = 0;
    while (turn < MAX_TOOL_TURNS) {
      turn += 1;

      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: 1024,
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ],
        tools: TOOLS,
        messages: apiMessages,
      });

      stream.on("text", (delta) => send("delta", { text: delta }));

      const finalMsg = await stream.finalMessage();

      if (finalMsg.stop_reason !== "tool_use") {
        // Model finished. Done.
        break;
      }

      // Append the assistant's tool_use turn verbatim, then run each tool and
      // append the tool_result block(s) as a single user message.
      apiMessages.push({ role: "assistant", content: finalMsg.content });

      const toolUses = finalMsg.content.filter((b) => b.type === "tool_use");
      send("status", { type: "tool_use", names: toolUses.map((t) => t.name) });

      const toolResults = [];
      for (const tu of toolUses) {
        const result = await dispatchTool(tu);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
          ...(result?.error ? { is_error: true } : {}),
        });
      }
      apiMessages.push({ role: "user", content: toolResults });
    }

    send("done", {});
    res.end();
  } catch (err) {
    console.error("chat error:", err);
    send("error", { message: "Sorry, something went wrong on our side." });
    res.end();
  }
});

app.get("/healthz", (_req, res) => res.json({ ok: true, model: MODEL }));

app.listen(PORT, () => {
  console.log(`\n  THEHELIGROUP demo running at http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL}\n`);
});
