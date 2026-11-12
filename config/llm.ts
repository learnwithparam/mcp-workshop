// Turns a role into a Vercel AI SDK model for the chosen provider. Replay needs no key and no network:
// it plays back recorded model turns from world/replays/, so the course, its checks and CI run for free.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { KEY_NAMES, MODELS, provider, type Role } from "./models";

export type ReplayStep = {
  toolCalls?: { name: string; input: Record<string, unknown> }[];
  text?: string;
};
export type ReplayConversation = { question: string; as?: string; steps: ReplayStep[] };
export const REPLAY_DIR = join(import.meta.dir, "..", "world", "replays");
export const PROBE = "Reply with the single word: ok";

export const normalizedQuestion = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function loadReplays(file = "front-desk.json"): ReplayConversation[] {
  const p = join(REPLAY_DIR, file);
  return existsSync(p)
    ? (JSON.parse(readFileSync(p, "utf8")).conversations as ReplayConversation[])
    : [];
}

function key(name: string) {
  const k = process.env[name];
  if (!k)
    throw new Error(
      `${name} is not set. Add it to .env (see .env.example), or use LLM_PROVIDER=replay.`,
    );
  return k;
}

const usage = (i: number, o: number) => ({
  inputTokens: { total: i, noCache: i, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: o, text: o, reasoning: 0 },
});

/** A model that plays back a recorded conversation, turn by turn. */
function replayModel(ctx: { as?: string; file?: string }): LanguageModel {
  return {
    specificationVersion: "v4",
    provider: "replay",
    modelId: "replay",
    supportedUrls: {},
    async doGenerate(options: any) {
      const prompt = options.prompt as { role: string; content: any }[];
      const firstUser = prompt.find((m) => m.role === "user");
      const question = Array.isArray(firstUser?.content)
        ? firstUser?.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join(" ")
        : String(firstUser?.content ?? "");
      const turn = prompt.filter((m) => m.role === "assistant").length;
      let step: ReplayStep | undefined;
      if (normalizedQuestion(question) === normalizedQuestion(PROBE)) step = { text: "ok" };
      else {
        const convo = loadReplays(ctx.file).find(
          (c) => normalizedQuestion(c.question) === normalizedQuestion(question) && (!c.as || !ctx.as || c.as === ctx.as),
        );
        if (!convo) throw new ReplayMissing(question, ctx.as);
        step = convo.steps[turn] ?? { text: "" };
      }
      const content = step.toolCalls?.length
        ? step.toolCalls.map((c, i) => ({
            type: "tool-call",
            toolCallId: `replay-${turn}-${i}`,
            toolName: c.name,
            input: JSON.stringify(c.input),
          }))
        : [{ type: "text", text: step.text ?? "" }];
      return {
        content,
        finishReason: { unified: step.toolCalls?.length ? "tool-calls" : "stop", raw: undefined },
        usage: usage(0, 0),
        warnings: [],
      };
    },
    async doStream() {
      throw new Error("The replay model does not stream. Use generateText.");
    },
  } as unknown as LanguageModel;
}

export class ReplayMissing extends Error {
  constructor(
    public question: string,
    public as?: string,
  ) {
    super(
      `There is no recorded reply for "${question}"${as ? ` as ${as}` : ""}. Ask a recorded question, or set LLM_PROVIDER and a key in .env to ask anything.`,
    );
  }
}

/** The model for a role on the chosen provider. */
export function model(role: Role, ctx: { as?: string; file?: string } = {}): LanguageModel {
  const p = provider();
  if (p === "replay") return replayModel(ctx);
  if (p === "anthropic")
    return createAnthropic({ apiKey: key(KEY_NAMES.anthropic) })(MODELS.anthropic[role]);
  if (p === "openai") return createOpenAI({ apiKey: key(KEY_NAMES.openai) })(MODELS.openai[role]);
  if (p === "openrouter")
    return createOpenRouter({ apiKey: key(KEY_NAMES.openrouter) })(
      MODELS.openrouter[role],
    ) as unknown as LanguageModel;
  return createOpenAI({
    baseURL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
    apiKey: "ollama",
  }).chat(MODELS.ollama[role]);
}
