// bun run models: one tiny call per role on the chosen provider. Prints provider, role, pass or fail, and cost.
// It never prints a key.
import { generateText } from "ai";
import { model, PROBE } from "./llm";
import { MODELS, PRICES, provider, type Role } from "./models";

const p = provider();
let failed = 0;
for (const role of ["fast", "smart", "judge"] as Role[]) {
  try {
    const r = await generateText({ model: model(role), prompt: PROBE, maxOutputTokens: 16 });
    const ok = /\bok\b/i.test(r.text);
    const id = p === "replay" ? "" : (MODELS as any)[p][role];
    const price = PRICES[id];
    const i = r.usage.inputTokens ?? 0,
      o = r.usage.outputTokens ?? 0;
    const cost =
      p === "replay"
        ? "cost USD 0 (replay)"
        : price
          ? `cost USD ${((i * price[0] + o * price[1]) / 1e6).toFixed(6)}`
          : `${i} tokens in, ${o} out (no price on file)`;
    console.log(`${ok ? "PASS" : "FAIL"}  provider ${p}, role ${role}, ${cost}`);
    if (!ok) failed++;
  } catch (e) {
    failed++;
    console.log(`FAIL  provider ${p}, role ${role}: ${(e as Error).message.split("\n")[0]}`);
  }
}
console.log(
  failed
    ? `${failed} role(s) failed. Check LLM_PROVIDER and the key in .env.`
    : `Every role answers on ${p}.`,
);
process.exit(failed ? 1 : 0);
