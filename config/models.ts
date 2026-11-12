// The only file that names a model. Code asks for a role (fast, smart, judge), never an id.
// Pick the provider with LLM_PROVIDER in .env: replay (default, no key), anthropic, openrouter, openai or ollama.
// Ids read from the providers' live lists on 12 Nov 2026 (curriculum briefs/MODELS.md). Recheck when you change them.
export type Role = "fast" | "smart" | "judge";
export type Provider = "replay" | "anthropic" | "openrouter" | "openai" | "ollama";

export const MODELS: Record<Exclude<Provider, "replay">, Record<Role, string>> = {
  anthropic: { fast: "claude-haiku-5-5", smart: "claude-sonnet-5-5", judge: "claude-haiku-5-5" },
  openrouter: {
    fast: "nvidia/nemotron-3.5-lightning",
    smart: "anthropic/claude-sonnet-5.5",
    judge: "anthropic/claude-haiku-5.5",
  },
  openai: { fast: "gpt-6-luna", smart: "gpt-6-luna-pro", judge: "gpt-6-luna" },
  ollama: {
    fast: process.env.OLLAMA_MODEL ?? "qwen3",
    smart: process.env.OLLAMA_MODEL ?? "qwen3",
    judge: process.env.OLLAMA_MODEL ?? "qwen3",
  },
};

// USD per million tokens, input and output, where the price was read from the provider's page.
export const PRICES: Record<string, [number, number]> = {
  "nvidia/nemotron-3.5-lightning": [0.07, 0.2],
};

export const KEY_NAMES: Record<Exclude<Provider, "replay" | "ollama">, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
};

export function provider(): Provider {
  const p = (process.env.LLM_PROVIDER ?? "replay").toLowerCase();
  if (!["replay", "anthropic", "openrouter", "openai", "ollama"].includes(p))
    throw new Error(
      `LLM_PROVIDER="${p}" is not one of replay, anthropic, openrouter, openai, ollama`,
    );
  return p as Provider;
}
