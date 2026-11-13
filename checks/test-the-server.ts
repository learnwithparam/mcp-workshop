// test-the-server: the learner's own tests pass on their server, and they catch a broken one.
// The check runs `bun test` in the folder, then on two mutants: copies of the folder with one
// safety rule removed from server.ts. A good test suite fails on each mutant. A suite that
// asserts nothing passes on them, and so is caught.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { rule, scenario } from "./lib/rules";
import { freshWorld } from "./lib/world";

const LEAST_TESTS = 4;
const TEST_TIMEOUT_MS = 60000;

type TestRun = { passed: number; failed: number; exitCode: number };

// Each mutant makes one function in server.ts give up at once, as if its check were deleted.
const MUTANTS = {
  clashCheckRemoved: "findClash",
  patientCheckRemoved: "unknownPatientError",
};

async function runTests(folder: string): Promise<TestRun> {
  const world = freshWorld();
  const testRun = Bun.spawn([process.execPath, "test", "./test"], {
    cwd: folder,
    env: { ...(process.env as Record<string, string>), ...world.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => testRun.kill(), TEST_TIMEOUT_MS);
  // bun test prints its summary, such as "5 pass", on stderr.
  const summary = await new Response(testRun.stderr).text();
  await new Response(testRun.stdout).text();
  const exitCode = await testRun.exited;
  clearTimeout(timer);
  const passed = Number(summary.match(/(\d+) pass/)?.[1] ?? 0);
  const failed = Number(summary.match(/(\d+) fail/)?.[1] ?? 0);
  return { passed, failed, exitCode };
}

/** server.ts with `return undefined;` as the first line of one function, or undefined. */
function mutatedSource(source: string, functionName: string): string | undefined {
  const signature = new RegExp(`(function ${functionName}\\([\\s\\S]*?\\)[^{]*\\{)`);
  if (!signature.test(source)) return undefined;
  return source.replace(signature, "$1\n  return undefined;");
}

// The copy sits next to the folder, so relative imports such as "../server" still resolve.
async function runOnMutant(dir: string, functionName: string): Promise<TestRun | undefined> {
  const source = readFileSync(join(dir, "server.ts"), "utf8");
  const mutated = mutatedSource(source, functionName);
  if (!mutated) return undefined;
  const mutantDir = join(dirname(dir), `.mutant-${functionName}-${process.pid}`);
  try {
    cpSync(dir, mutantDir, { recursive: true });
    writeFileSync(join(mutantDir, "server.ts"), mutated);
    return await runTests(mutantDir);
  } finally {
    rmSync(mutantDir, { recursive: true, force: true });
  }
}

type Outcome = {
  original?: TestRun;
  clashCheckRemoved?: TestRun;
  patientCheckRemoved?: TestRun;
};

const run = scenario(async (dir): Promise<Outcome> => {
  if (!existsSync(join(dir, "test"))) return {};
  const original = await runTests(dir);
  const clashCheckRemoved = await runOnMutant(dir, MUTANTS.clashCheckRemoved);
  const patientCheckRemoved = await runOnMutant(dir, MUTANTS.patientCheckRemoved);
  return { original, clashCheckRemoved, patientCheckRemoved };
});

const caught = (testRun: TestRun | undefined) => Boolean(testRun && testRun.exitCode !== 0);

export default [
  rule(
    "test/ has at least 4 tests, and they all pass on your server",
    async (dir) => {
      const original = ((await run(dir)) as Outcome).original;
      return Boolean(original && original.exitCode === 0 && original.passed >= LEAST_TESTS);
    },
    "add tests to test/server.test.ts and run bun test in the problem folder until all pass",
  ),
  rule(
    "Your tests fail when the clash check is removed from server.ts",
    async (dir) => caught(((await run(dir)) as Outcome).clashCheckRemoved),
    "book a free slot, then book the same time again and expect isError to be true; " +
      "keep the function findClash in server.ts so the check can break it",
  ),
  rule(
    "Your tests fail when the unknown-patient check is removed from server.ts",
    async (dir) => caught(((await run(dir)) as Outcome).patientCheckRemoved),
    "book patient P-9999 and expect isError to be true; keep the function unknownPatientError in " +
      "server.ts so the check can break it",
  ),
];
