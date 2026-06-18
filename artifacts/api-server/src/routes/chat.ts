import { Router, type IRouter, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "../lib/businessContext.js";
import { TOOLS, dispatchTool } from "../lib/tools.js";

const router: IRouter = Router();

const MODEL = process.env["ANTHROPIC_MODEL"] || "claude-sonnet-4-5";
const MAX_TOOL_TURNS = 6;

// @ts-ignore — lazy-init so missing key gives a clear error at request time, not startup
let anthropic: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropic) {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

function clientToApiMessage(m: { role: string; content: string }): Anthropic.MessageParam {
  return {
    role: m.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: String(m.content ?? "").slice(0, 4000) }],
  };
}

router.post("/chat", async (req: Request, res: Response) => {
  const { messages } = (req.body ?? {}) as { messages?: { role: string; content: string }[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  const apiMessages: Anthropic.MessageParam[] = messages.slice(-20).map(clientToApiMessage);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // @ts-ignore
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const client = getClient();
    let turn = 0;

    while (turn < MAX_TOOL_TURNS) {
      turn += 1;

      // @ts-ignore — stream typing is complex; runtime is fine
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 1024,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOLS as Anthropic.Tool[],
        messages: apiMessages,
      });

      // @ts-ignore
      stream.on("text", (delta: string) => send("delta", { text: delta }));

      // @ts-ignore
      const finalMsg: Anthropic.Message = await stream.finalMessage();

      if (finalMsg.stop_reason !== "tool_use") {
        break;
      }

      apiMessages.push({ role: "assistant", content: finalMsg.content });

      const toolUses = finalMsg.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      send("status", { type: "tool_use", names: toolUses.map((t) => t.name) });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const result = await dispatchTool({
          name: tu.name,
          id: tu.id,
          input: tu.input as Record<string, unknown>,
        });
        const resultRecord = result as Record<string, unknown>;
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
          ...(resultRecord?.["error"] ? { is_error: true } : {}),
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

export default router;
