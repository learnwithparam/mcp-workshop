// Small helpers so every check reads the same way: run one scenario per folder, then judge it with rules.
import type { Rule } from "../../scripts/verify";

/** Run `fn` once per folder and share the result between that check's rules. */
export function scenario<T>(fn: (dir: string) => Promise<T>) {
  const cache = new Map<string, Promise<T | { failed: string }>>();
  return (dir: string) => {
    if (!cache.has(dir)) cache.set(dir, fn(dir).catch((e: Error) => ({ failed: e.message })));
    return cache.get(dir)!;
  };
}

export const failed = (x: unknown): x is { failed: string } => typeof x === "object" && x !== null && "failed" in x;

/**
 * A rule whose try-next line can name what went wrong. `tryNext` may be a function: verify reads it after the test,
 * so it can include the server's own error.
 */
export function rule(says: string, test: (dir: string) => boolean | Promise<boolean>, tryNext: string | (() => string)): Rule {
  return {
    says,
    test,
    get tryNext() { return typeof tryNext === "function" ? tryNext() : tryNext; },
  } as Rule;
}

/**
 * Behaviour that depends on a model is judged over three fresh runs in replay mode, and passes only if all three do.
 * Each run gets its own fresh world.
 */
export async function threeRuns(run: (i: number) => Promise<boolean>): Promise<boolean> {
  const prev = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "replay";
  try {
    for (let i = 0; i < 3; i++) if (!(await run(i))) return false;
    return true;
  } finally {
    if (prev === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = prev;
  }
}
