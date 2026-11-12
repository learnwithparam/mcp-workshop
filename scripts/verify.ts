// bun run verify <step-name>            check your work on one step, then show progress on every
//                                        step
// bun run verify <step-name> solution   check the sample solution instead
// bun run verify part <part-name>      check every step in one part (a deliverable)
// bun run verify --report               write verify-report.json for cohort grading
// bun run verify --all                  CI: each check fails on its starter and wrong answers,
//                                        and passes on its solution
// Exit codes: 0 pass, 1 fail, 2 the check could not run.

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { allSteps, findStep, type Part, parts, ROOT, type Step } from "./structure";

export type Rule = {
  says: string;
  test: (dir: string) => boolean | Promise<boolean>;
  tryNext: string;
};
type Result = {
  step: string;
  status: "pass" | "fail" | "error";
  passed: number;
  total: number;
  failed: string[];
};

async function rulesFor(step: Step): Promise<Rule[]> {
  const check = await import(join(ROOT, "checks", `${step.name}.ts`));
  return check.default;
}

/** Runs one rule. A rule that throws counts as a fail, never as a crash. */
async function rulePasses(rule: Rule, dir: string): Promise<boolean> {
  try {
    return await rule.test(dir);
  } catch {
    return false;
  }
}

function printRule(rule: Rule, ok: boolean) {
  if (ok) console.log(`  PASS  ${rule.says}`);
  else console.log(`  FAIL  ${rule.says}\n        Try next: ${rule.tryNext}`);
}

async function run(step: Step, dir: string, print = false): Promise<Result> {
  let rules: Rule[];
  try {
    rules = await rulesFor(step);
  } catch (error) {
    if (print) {
      const reason = (error as Error).message;
      console.log(`  ERROR  the check for ${step.name} could not load: ${reason}`);
    }
    return { step: step.name, status: "error", passed: 0, total: 0, failed: [] };
  }
  const failed: string[] = [];
  for (const rule of rules) {
    const ok = await rulePasses(rule, dir);
    if (!ok) failed.push(rule.says);
    if (print) printRule(rule, ok);
  }
  return {
    step: step.name,
    status: failed.length ? "fail" : "pass",
    passed: rules.length - failed.length,
    total: rules.length,
    failed,
  };
}

const work = (step: Step) => join(step.dir, "problem");

function wrongAnswers(step: Step) {
  const wrongDir = join(step.dir, "wrong");
  if (!existsSync(wrongDir)) return [];
  return readdirSync(wrongDir).map((mistake) => ({ name: mistake, dir: join(wrongDir, mistake) }));
}

const countPassing = (results: Result[]) =>
  results.filter((result) => result.status === "pass").length;

async function runEvery(steps: Step[]): Promise<Result[]> {
  const results: Result[] = [];
  for (const step of steps) results.push(await run(step, work(step)));
  return results;
}

/** Checks a check: it must reject the starter and wrong answers, and pass the solution. */
async function checkProblems(step: Step, rules: Rule[]): Promise<string[]> {
  const problems: string[] = [];
  for (const rule of rules)
    if (rule.tryNext.trim().split(/\s+/).length < 3)
      problems.push(`${step.name}: rule "${rule.says}" needs a try-next sentence`);
  if ((await run(step, work(step))).status === "pass")
    problems.push(`${step.name}: the check passes on the starter, so it checks nothing`);
  problems.push(...(await solutionProblems(step)));
  const wrong = wrongAnswers(step);
  if (wrong.length === 0)
    problems.push(
      `${step.name}: needs at least one wrong/<mistake>/ answer that the check must reject`,
    );
  for (const answer of wrong)
    if ((await run(step, answer.dir)).status === "pass")
      problems.push(`${step.name}: wrong answer "${answer.name}" passes the check`);
  return problems;
}

async function solutionProblems(step: Step): Promise<string[]> {
  if (!existsSync(join(step.dir, "solution")))
    return [`${step.name}: needs solution/ so CI can prove the check can pass`];
  const solution = await run(step, join(step.dir, "solution"));
  if (solution.status === "pass") return [];
  return [`${step.name}: the sample solution fails: ${solution.failed.join("; ")}`];
}

async function verifyEveryCheck() {
  const problems: string[] = [];
  for (const step of allSteps()) {
    let rules: Rule[] = [];
    try {
      rules = await rulesFor(step);
    } catch (error) {
      problems.push(`${step.name}: the check could not load: ${(error as Error).message}`);
      continue;
    }
    problems.push(...(await checkProblems(step, rules)));
  }
  for (const problem of problems) console.log(`  ${problem}`);
  console.log(
    problems.length
      ? `${problems.length} check problem(s).`
      : "Every check rejects its starter and wrong answers, and passes its solution.",
  );
  process.exit(problems.length ? 1 : 0);
}

async function writeReport() {
  const results = await runEvery(allSteps());
  const reportPath = join(ROOT, "verify-report.json");
  const report = { version: 1, at: new Date().toISOString(), results };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const passing = countPassing(results);
  console.log(`Wrote verify-report.json: ${passing} of ${results.length} steps pass.`);
  process.exit(0);
}

function exitCodeForPart(results: Result[]): number {
  if (results.some((result) => result.status === "error")) return 2;
  if (countPassing(results) === results.length) return 0;
  return 1;
}

function findPartOrExit(partName: string | undefined): Part {
  const part = parts().find((candidate) => candidate.name === partName);
  if (part) return part;
  console.log(partName ? `There is no part called "${partName}". Parts:` : "Name a part. Parts:");
  for (const candidate of parts()) console.log(`  bun run verify part ${candidate.name}`);
  process.exit(1);
}

async function verifyPart(partName: string | undefined) {
  const part = findPartOrExit(partName);
  console.log(`Part ${part.name}:`);
  const results: Result[] = [];
  for (const step of part.steps) {
    const result = await run(step, work(step));
    results.push(result);
    const status = result.status.toUpperCase().padEnd(5);
    console.log(`  ${status}  ${step.name}  (${result.passed}/${result.total} rules)`);
  }
  const done = countPassing(results);
  console.log(
    done === results.length
      ? `Part ${part.name} is done: ${done}/${results.length} steps pass.`
      : `${done}/${results.length} steps pass. ` +
          "Run bun run verify <step-name> on a FAIL line to see why.",
  );
  process.exit(exitCodeForPart(results));
}

function findStepOrExit(stepName: string | undefined): Step {
  const step = stepName && findStep(stepName);
  if (step) return step;
  console.log(stepName ? `There is no step called "${stepName}". Steps:` : "Name a step. Steps:");
  for (const candidate of allSteps()) console.log(`  bun run verify ${candidate.name}`);
  process.exit(1);
}

async function verifyStep(stepName: string | undefined, which: string | undefined) {
  const step = findStepOrExit(stepName);
  const asSolution = which === "solution";
  console.log(`Checking ${step.name} (${asSolution ? "sample solution" : "your work"}):`);
  const dir = asSolution ? join(step.dir, "solution") : work(step);
  const result = await run(step, dir, true);
  if (result.status === "error") process.exit(2);
  console.log(
    result.status === "pass"
      ? `Done. All ${result.total} rules pass.`
      : `${result.passed} of ${result.total} rules pass. Fix the FAIL lines and run it again.`,
  );
  if (!asSolution) {
    // Done is recomputed from the checks every time, never read from a saved flag.
    const everyStep = await runEvery(allSteps());
    console.log(`Progress: ${countPassing(everyStep)}/${everyStep.length} steps pass.`);
  }
  process.exit(result.status === "pass" ? 0 : 1);
}

const [command, which] = process.argv.slice(2);

if (command === "--all") await verifyEveryCheck();
else if (command === "--report") await writeReport();
else if (command === "part") await verifyPart(which);
else await verifyStep(command, which);
