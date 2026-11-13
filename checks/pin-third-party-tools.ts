// pin-third-party-tools: pins.ts records the trusted release of the insurance server, then catches
// a changed description, a poisoned parameter and a new tool in later releases.
// The check runs the learner's pins.ts in a copy of their folder, so a pins.json it rewrites never
// changes their own files.
import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { failed, rule, scenario } from "./lib/rules";

const PART_DIR = join(import.meta.dir, "..", "parts", "04-defend-and-ship");
const INSURANCE_DIR = join(PART_DIR, "01-pin-third-party-tools", "insurance");
const TRUSTED_TOOLS = ["submit_claim", "claim_status", "policy_for_pet"];
const RELEASES = ["1.4.0", "1.4.1", "1.5.0", "1.6.0"] as const;
const PIN_RUN_TIMEOUT_MS = 20000;

type Release = (typeof RELEASES)[number];
type PinRun = { exitCode: number; output: string };

/** The tool names pinned in pins.json, read from "tools" or from the top level of the file. */
function pinnedToolNames(dir: string): string[] {
  const pinsPath = join(dir, "pins.json");
  if (!existsSync(pinsPath)) return [];
  try {
    const pins = JSON.parse(readFileSync(pinsPath, "utf8"));
    return Object.keys(pins.tools ?? pins);
  } catch {
    return [];
  }
}

/** Runs `bun pins.ts check <release>` in the copied folder and keeps what it printed. */
async function checkRelease(copyDir: string, release: Release): Promise<PinRun> {
  const serverScript = join(INSURANCE_DIR, `release-${release}.ts`);
  const pinRun = Bun.spawn([process.execPath, "pins.ts", "check", serverScript], {
    cwd: copyDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => pinRun.kill(), PIN_RUN_TIMEOUT_MS);
  const stdout = await new Response(pinRun.stdout).text();
  const stderr = await new Response(pinRun.stderr).text();
  const exitCode = await pinRun.exited;
  clearTimeout(timer);
  return { exitCode, output: `${stdout}\n${stderr}` };
}

const run = scenario(async (dir) => {
  if (!existsSync(join(dir, "pins.ts"))) throw new Error("there is no pins.ts in the folder");
  const copyDir = mkdtempSync(join(tmpdir(), "harrow-pins-"));
  cpSync(resolve(dir), copyDir, { recursive: true });
  const runs = {} as Record<Release, PinRun>;
  for (const release of RELEASES) runs[release] = await checkRelease(copyDir, release);
  return runs;
});

/** True when pins.ts refused this release and named the tool that changed. */
async function refusedAndNamed(dir: string, release: Release, toolName: string) {
  const runs = await run(dir);
  if (failed(runs)) return false;
  const pinRun = runs[release];
  return pinRun.exitCode !== 0 && pinRun.output.includes(toolName);
}

let trustedOutput = "";

export default [
  rule(
    "pins.json pins the three tools of the trusted release 1.4.0",
    async (dir) => {
      const pinned = pinnedToolNames(dir);
      return TRUSTED_TOOLS.every((name) => pinned.includes(name));
    },
    "in your folder run: bun pins.ts record ../insurance/release-1.4.0.ts",
  ),
  rule(
    "The check passes on release 1.4.0, the one you pinned (exit code 0)",
    async (dir) => {
      const runs = await run(dir);
      if (failed(runs)) return false;
      const outputLines = runs["1.4.0"].output.trim().split("\n");
      trustedOutput = outputLines.slice(-2).join(" | ");
      return runs["1.4.0"].exitCode === 0;
    },
    () =>
      "record pins.json from release-1.4.0.ts, then run bun pins.ts check on the same file. " +
      `It printed: ${trustedOutput || "nothing"}`,
  ),
  rule(
    "The check fails on release 1.4.1 (a changed description) and names submit_claim",
    (dir) => refusedAndNamed(dir, "1.4.1", "submit_claim"),
    "the fingerprint must change when the description changes: hash the whole tool definition",
  ),
  rule(
    "The check fails on release 1.5.0 (a poisoned parameter) and names claim_status",
    (dir) => refusedAndNamed(dir, "1.5.0", "claim_status"),
    "hash every schema field too, not only the name and description: use the whole tool as JSON",
  ),
  rule(
    "The check fails on release 1.6.0 (a new tool) and names share_claim_file",
    (dir) => refusedAndNamed(dir, "1.6.0", "share_claim_file"),
    "a tool that is not in pins.json is a change too: report it as NEW and exit 1",
  ),
];
