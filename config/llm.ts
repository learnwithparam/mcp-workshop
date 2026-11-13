// Turns a role into a Vercel AI SDK model for the chosen provider. Replay needs no key and no
// network: it plays back recorded model turns from world/replays/, so the course, its checks and
// CI run for free.

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

// Which recording to play back: the person asking, and the replay file to read.
type ReplayChoice = { as?: string; file?: string };

// The parts of the AI SDK prompt that the replay model reads.
type PromptPart = { type: string; text?: string };
type PromptMessage = { role: string; content: string | PromptPart[] };

export const normalizedQuestion = (question: string) =>
  question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function loadReplays(file = "front-desk.json"): ReplayConversation[] {
  const replayPath = join(REPLAY_DIR, file);
  if (!existsSync(replayPath)) return [];
  return JSON.parse(readFileSync(replayPath, "utf8")).conversations as ReplayConversation[];
}

function apiKey(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} is not set. Add it to .env (see .env.example), or use LLM_PROVIDER=replay.`,
    );
  return value;
}

const usage = (inputTokens: number, outputTokens: number) => ({
  inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
});

/** The text of the first user message: the question the recording is filed under. */
function firstQuestion(prompt: PromptMessage[]): string {
  const firstUser = prompt.find((message) => message.role === "user");
  if (!Array.isArray(firstUser?.content)) return String(firstUser?.content ?? "");
  const textParts = firstUser.content.filter((part) => part.type === "text");
  return textParts.map((part) => part.text).join(" ");
}

/** The recorded step to play for this question and turn. */
function replayStep(question: string, turn: number, choice: ReplayChoice): ReplayStep {
  const asked = normalizedQuestion(question);
  if (asked === normalizedQuestion(PROBE)) return { text: "ok" };
  const conversation = loadReplays(choice.file).find(
    (recorded) =>
      normalizedQuestion(recorded.question) === asked &&
      (!recorded.as || !choice.as || recorded.as === choice.as),
  );
  if (!conversation) throw new ReplayMissing(question, choice.as);
  return conversation.steps[turn] ?? { text: "" };
}

/** Turns a recorded step into the content blocks the AI SDK expects from a model. */
function stepContent(step: ReplayStep, turn: number) {
  if (!step.toolCalls?.length) return [{ type: "text", text: step.text ?? "" }];
  return step.toolCalls.map((call, i) => ({
    type: "tool-call",
    toolCallId: `replay-${turn}-${i}`,
    toolName: call.name,
    input: JSON.stringify(call.input),
  }));
}

/** A model that plays back a recorded conversation, turn by turn. */
function replayModel(choice: ReplayChoice): LanguageModel {
  return {
    specificationVersion: "v4",
    provider: "replay",
    modelId: "replay",
    supportedUrls: {},
    async doGenerate(options: { prompt: PromptMessage[] }) {
      const prompt = options.prompt;
      const turn = prompt.filter((message) => message.role === "assistant").length;
      const step = replayStep(firstQuestion(prompt), turn, choice);
      const finishedWith = step.toolCalls?.length ? "tool-calls" : "stop";
      return {
        content: stepContent(step, turn),
        finishReason: { unified: finishedWith, raw: undefined },
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
    const asWho = as ? ` as ${as}` : "";
    super(
      `There is no recorded reply for "${question}"${asWho}. ` +
        "Ask a recorded question, or set LLM_PROVIDER and a key in .env to ask anything.",
    );
  }
}

/** The model for a role on the chosen provider. */
export function model(role: Role, choice: ReplayChoice = {}): LanguageModel {
  const chosen = provider();
  if (chosen === "replay") return replayModel(choice);
  if (chosen === "anthropic") {
    const anthropic = createAnthropic({ apiKey: apiKey(KEY_NAMES.anthropic) });
    return anthropic(MODELS.anthropic[role]);
  }
  if (chosen === "openai") {
    const openai = createOpenAI({ apiKey: apiKey(KEY_NAMES.openai) });
    return openai(MODELS.openai[role]);
  }
  if (chosen === "openrouter") {
    const openrouter = createOpenRouter({ apiKey: apiKey(KEY_NAMES.openrouter) });
    return openrouter(MODELS.openrouter[role]) as unknown as LanguageModel;
  }
  const ollama = createOpenAI({
    // biome-ignore lint/style/useNamingConvention: the AI SDK names this option baseURL
    baseURL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
    apiKey: "ollama",
  });
  return ollama.chat(MODELS.ollama[role]);
}
