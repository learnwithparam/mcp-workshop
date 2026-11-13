// pass-conformance: the official MCP conformance suite passes against the server, with only the
// failures the course excuses in conformance-expected-failures.yml.
import { join } from "node:path";
import { withHttpServer } from "../parts/03-open-the-server-safely/http-check-kit";
import { failed, rule, scenario } from "./lib/rules";

const CONFORMANCE = "@modelcontextprotocol/conformance@0.2.0-alpha.12";
const EXPECTED_FAILURES = join(
  import.meta.dir,
  "..",
  "parts",
  "03-open-the-server-safely",
  "conformance-expected-failures.yml",
);
const SUITE_TIMEOUT_MS = 180000;

type SuiteRun = { exitCode: number; output: string; unexpected: string[] };

// The lines under "Unexpected failures": each names a scenario, or scenario:check.
function unexpectedFailures(output: string): string[] {
  const plain = output.replaceAll(/\u001b\[[0-9;]*m/g, "");
  const section = plain.split("Unexpected failures (not in baseline):")[1] ?? "";
  const lines = section.split("\n").map((line) => line.trim());
  const failures = lines.filter((line) => line.startsWith("✗ "));
  return failures.map((line) => line.slice(2));
}

async function runSuite(url: string): Promise<SuiteRun> {
  const suite = Bun.spawn(
    [
      process.execPath,
      "x",
      CONFORMANCE,
      "server",
      "--url",
      url,
      "--requirements",
      "2026-07-28",
      "--expected-failures",
      EXPECTED_FAILURES,
    ],
    { stdout: "pipe", stderr: "pipe", timeout: SUITE_TIMEOUT_MS },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(suite.stdout).text(),
    new Response(suite.stderr).text(),
  ]);
  const exitCode = await suite.exited;
  const output = `${stdout}\n${stderr}`;
  return { exitCode, output, unexpected: unexpectedFailures(output) };
}

const run = scenario(async (dir) => withHttpServer(dir, async ({ url }) => runSuite(url)));

let lastError = "";
const ok = async (dir: string) => {
  const outcome = await run(dir);
  return failed(outcome) ? undefined : outcome;
};
let lastUnexpected: string[] = [];
const named = () => lastUnexpected.slice(0, 4).join(", ") || "none";

function noUnexpectedFailureIn(scenarioName: string) {
  return async (dir: string) => {
    const outcome = await ok(dir);
    if (!outcome) return false;
    lastUnexpected = outcome.unexpected;
    return !outcome.unexpected.some((failure) => failure.split(":")[0] === scenarioName);
  };
}

export default [
  rule(
    "bun http.ts starts and answers on the port in MCP_PORT",
    async (dir) => {
      const outcome = await run(dir);
      lastError = failed(outcome) ? outcome.failed : "";
      return !failed(outcome);
    },
    () => `run "bun http.ts" in the problem folder and fix what it prints. Saw: ${lastError}`,
  ),
  rule(
    "Every server-stateless check the course does not excuse passes",
    noUnexpectedFailureIn("server-stateless"),
    () =>
      "a server must answer a bad request with the right HTTP status and a JSON-RPC error. " +
      `Return the handler's Response as it is. Unexpected failures: ${named()}`,
  ),
  rule(
    "The dns-rebinding-protection scenario passes",
    noUnexpectedFailureIn("dns-rebinding-protection"),
    "keep the Host check from serve-over-http: a strange Host or Origin gets 403",
  ),
  rule(
    "The whole suite exits 0 with the shipped expected-failures file",
    async (dir) => (await ok(dir))?.exitCode === 0,
    () =>
      "run the suite yourself (the command is in the step README) and read the Unexpected " +
      `failures list at the end. Unexpected failures: ${named()}`,
  ),
];
