// bun run models: one tiny call per role on the chosen provider. Prints provider, role, pass or
// fail, and cost. It never prints a key.
import { generateText } from "ai";
import { model, PROBE } from "./llm";
import { MODELS, PRICES, type Provider, provider, type Role } from "./models";

const chosen = provider();
let failed = 0;

/** The model id for a role, or "" on replay, which has no id. */
function modelId(chosenProvider: Provider, role: Role): string {
  if (chosenProvider === "replay") return "";
  return MODELS[chosenProvider][role];
}

/** One plain sentence about what the probe call cost. */
function costLine(role: Role, inputTokens: number, outputTokens: number): string {
  if (chosen === "replay") return "cost USD 0 (replay)";
  const price = PRICES[modelId(chosen, role)];
  if (!price) return `${inputTokens} tokens in, ${outputTokens} out (no price on file)`;
  const dollars = (inputTokens * price[0] + outputTokens * price[1]) / 1e6;
  return `cost USD ${dollars.toFixed(6)}`;
}

for (const role of ["fast", "smart", "judge"] as Role[]) {
  try {
    const reply = await generateText({ model: model(role), prompt: PROBE, maxOutputTokens: 16 });
    const ok = /\bok\b/i.test(reply.text);
    const inputTokens = reply.usage.inputTokens ?? 0;
    const outputTokens = reply.usage.outputTokens ?? 0;
    const cost = costLine(role, inputTokens, outputTokens);
    console.log(`${ok ? "PASS" : "FAIL"}  provider ${chosen}, role ${role}, ${cost}`);
    if (!ok) failed++;
  } catch (error) {
    failed++;
    const firstLine = (error as Error).message.split("\n")[0];
    console.log(`FAIL  provider ${chosen}, role ${role}: ${firstLine}`);
  }
}
console.log(
  failed
    ? `${failed} role(s) failed. Check LLM_PROVIDER and the key in .env.`
    : `Every role answers on ${chosen}.`,
);
process.exit(failed ? 1 : 0);
