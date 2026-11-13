// build-a-small-client: client.ts talks to a 2026-07-28 server (the Part 1 server) and to the
// lab's old 2025-11-25 server, and prints what it found out about each one.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { timesIn } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";
import { freshWorld } from "./lib/world";

const PARTS_DIR = join(import.meta.dir, "..", "parts");
const MODERN_SERVER = join(PARTS_DIR, "01-give-the-diary", "04-connect-claude", "solution");
const LEGACY_SERVER = join(
  PARTS_DIR,
  "05-grow-the-server",
  "01-build-a-small-client",
  "legacy-lab",
);
const CLIENT_TIMEOUT_MS = 20000;

type ClientRun = { exitCode: number; output: string };

/** Runs `bun client.ts <server> <tool> <json>` in the learner's folder against a fresh world. */
async function runClient(dir: string, serverScript: string, toolCall: string[]) {
  const world = freshWorld();
  const clientRun = Bun.spawn([process.execPath, "client.ts", serverScript, ...toolCall], {
    cwd: resolve(dir),
    env: { ...(process.env as Record<string, string>), ...world.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => clientRun.kill(), CLIENT_TIMEOUT_MS);
  const stdout = await new Response(clientRun.stdout).text();
  const stderr = await new Response(clientRun.stderr).text();
  const exitCode = await clientRun.exited;
  clearTimeout(timer);
  return { exitCode, output: `${stdout}\n${stderr}`, world };
}

const run = scenario(async (dir) => {
  if (!existsSync(join(dir, "client.ts"))) throw new Error("there is no client.ts in the folder");
  const modern = await runClient(dir, join(MODERN_SERVER, "server.ts"), [
    "find_free_slots",
    '{"site":"millbrook"}',
  ]);
  const legacy = await runClient(dir, join(LEGACY_SERVER, "server.ts"), ["lab_status", "{}"]);
  const freeSlots = modern.world.freeSlots({ site: "millbrook", length: 20 });
  const freeStarts = freeSlots.map((slot) => slot.start);
  return { modern, legacy, freeStarts };
});

/** The line that starts with this label, such as "Protocol:", or an empty string. */
function lineStarting(clientRun: ClientRun, label: string): string {
  const lines = clientRun.output.split("\n");
  return lines.find((line) => line.startsWith(label)) ?? "";
}

let lastOutput = "";
function lastLines(): string {
  const lines = lastOutput.trim().split("\n");
  return lines.slice(-3).join(" | ");
}

export default [
  rule(
    "With the Part 1 server, it speaks 2026-07-28 (the Protocol line)",
    async (dir) => {
      const runs = await run(dir);
      if (failed(runs)) return false;
      lastOutput = runs.modern.output;
      return lineStarting(runs.modern, "Protocol:").includes("2026-07-28");
    },
    () =>
      'pass { versionNegotiation: { mode: "auto" } } to new Client. ' +
      `Your client printed: ${lastLines() || "nothing"}`,
  ),
  rule(
    "It prints the versions that server/discover lists (the Supported versions line)",
    async (dir) => {
      const runs = await run(dir);
      if (failed(runs)) return false;
      return lineStarting(runs.modern, "Supported versions:").includes("2026-07-28");
    },
    'print "Supported versions: " and client.getDiscoverResult()?.supportedVersions',
  ),
  rule(
    "It lists the tools: find_free_slots and book_appointment (the Tools line)",
    async (dir) => {
      const runs = await run(dir);
      if (failed(runs)) return false;
      const toolsLine = lineStarting(runs.modern, "Tools:");
      return toolsLine.includes("find_free_slots") && toolsLine.includes("book_appointment");
    },
    'print "Tools: " and the names from client.listTools(), joined with commas',
  ),
  rule(
    "It calls find_free_slots and prints real free slots from the diary",
    async (dir) => {
      const runs = await run(dir);
      if (failed(runs)) return false;
      const times = timesIn(runs.modern.output);
      return runs.modern.exitCode === 0 && times.some((time) => runs.freeStarts.includes(time));
    },
    "call the tool named on the command line with its JSON arguments, and print the result text",
  ),
  rule(
    "With the lab's old server, it falls back to 2025-11-25 and still calls lab_status",
    async (dir) => {
      const runs = await run(dir);
      if (failed(runs)) return false;
      lastOutput = runs.legacy.output;
      const protocolLine = lineStarting(runs.legacy, "Protocol:");
      const called = runs.legacy.output.includes("The lab is open");
      return runs.legacy.exitCode === 0 && protocolLine.includes("2025-11-25") && called;
    },
    () =>
      'use mode "auto", not a pinned version: an old server cannot answer server/discover. ' +
      `Your client printed: ${lastLines() || "nothing"}`,
  ),
];
