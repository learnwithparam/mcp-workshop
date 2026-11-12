// Small helpers so every check reads the same way: run one scenario per folder, then judge it with
// rules.
import type { Rule } from "../../scripts/verify";

type Failure = { failed: string };

/** Run `runScenario` once per folder and share the result between that check's rules. */
export function scenario<Result>(runScenario: (dir: string) => Promise<Result>) {
  const resultsByFolder = new Map<string, Promise<Result | Failure>>();
  return (dir: string) => {
    let result = resultsByFolder.get(dir);
    if (!result) {
      result = runScenario(dir).catch((error: Error) => ({ failed: error.message }));
      resultsByFolder.set(dir, result);
    }
    return result;
  };
}

export const failed = (outcome: unknown): outcome is Failure =>
  typeof outcome === "object" && outcome !== null && "failed" in outcome;

/**
 * A rule whose try-next line can name what went wrong. `tryNext` may be a function: verify reads
 * it after the test, so it can include the server's own error.
 */
export function rule(
  says: string,
  test: (dir: string) => boolean | Promise<boolean>,
  tryNext: string | (() => string),
): Rule {
  return {
    says,
    test,
    get tryNext() {
      return typeof tryNext === "function" ? tryNext() : tryNext;
    },
  } as Rule;
}

/**
 * Behaviour that depends on a model is judged over three fresh runs in replay mode, and passes only
 * if all three do. Each run gets its own fresh world.
 */
export async function threeRuns(run: (runNumber: number) => Promise<boolean>): Promise<boolean> {
  const previousProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "replay";
  try {
    for (let i = 0; i < 3; i++) {
      if (!(await run(i))) return false;
    }
    return true;
  } finally {
    if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previousProvider;
  }
}
