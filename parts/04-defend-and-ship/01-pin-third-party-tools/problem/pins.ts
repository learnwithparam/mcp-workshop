// Pin a third-party MCP server: save a fingerprint of every tool it offers, then catch any change.
//   bun pins.ts record <server.ts>   save the tools of the release you checked to pins.json
//   bun pins.ts check <server.ts>    compare a new release with pins.json
// Check it with: bun run verify pin-third-party-tools
// TODO: you need createHash from "node:crypto".
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

type Tool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];
type Pin = { fingerprint: string; definition: string };
type Pins = { tools: Record<string, Pin> };

const PINS_FILE = "pins.json";

/** Start the server script with Bun, list its tools, and stop it again. */
async function toolsOf(serverScript: string): Promise<Tool[]> {
  const client = new Client({ name: "harrow-lane-pins", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverScript],
    stderr: "ignore",
  });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    return tools;
  } finally {
    await client.close();
  }
}

/** The same value as JSON, with the keys of every object sorted, so the text is always the same. */
function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>);
  entries.sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey));
  const sortedEntries = entries.map(([key, inner]) => [key, withSortedKeys(inner)]);
  return Object.fromEntries(sortedEntries);
}

/** The whole tool as readable JSON: name, description and every field of every schema. */
function fullDefinition(tool: Tool): string {
  return JSON.stringify(withSortedKeys(tool), null, 2);
}

/**
 * A fingerprint of the tool: a short text that changes when anything in the tool changes.
 * TODO: hash the whole definition with SHA-256. Use fullDefinition(tool) and createHash.
 * Today it uses the name only, so a changed description or a new parameter goes unseen.
 */
function fingerprint(tool: Tool): string {
  return tool.name;
}

async function record(serverScript: string) {
  const pins: Pins = { tools: {} };
  for (const tool of await toolsOf(serverScript)) {
    pins.tools[tool.name] = { fingerprint: fingerprint(tool), definition: fullDefinition(tool) };
  }
  writeFileSync(PINS_FILE, `${JSON.stringify(pins, null, 2)}\n`);
  console.log(`Pinned ${Object.keys(pins.tools).length} tools in ${PINS_FILE}.`);
}

/** The lines of the new definition that are not in the pinned one, marked with a plus. */
function addedLines(pinned: string, current: string): string[] {
  const pinnedLines = new Set(pinned.split("\n"));
  const currentLines = current.split("\n");
  // Lines with only brackets or commas say nothing, so they are left out.
  const meaningfulLines = currentLines.filter((line) => /[A-Za-z]/.test(line));
  const newLines = meaningfulLines.filter((line) => !pinnedLines.has(line));
  return newLines.map((line) => `    + ${line.trim()}`);
}

/** Compares every tool with its pin. Returns one problem line per tool that changed or is new. */
function problemsWith(tools: Tool[], pins: Pins): string[] {
  const problems: string[] = [];
  for (const tool of tools) {
    const pin = pins.tools[tool.name];
    if (!pin) {
      problems.push(`NEW ${tool.name}: this tool is not in ${PINS_FILE}.`);
    } else if (pin.fingerprint !== fingerprint(tool)) {
      problems.push(`CHANGED ${tool.name}: its definition is not the one you pinned.`);
      problems.push(...addedLines(pin.definition, fullDefinition(tool)));
    }
  }
  return problems;
}

async function check(serverScript: string) {
  if (!existsSync(PINS_FILE)) {
    console.log(`There is no ${PINS_FILE} yet. Run: bun pins.ts record <server.ts>`);
    process.exit(2);
  }
  const pins = JSON.parse(readFileSync(PINS_FILE, "utf8")) as Pins;
  const problems = problemsWith(await toolsOf(serverScript), pins);
  if (problems.length === 0) {
    console.log(`OK: every tool matches ${PINS_FILE}.`);
    return;
  }
  for (const problem of problems) console.log(problem);
  console.log("Do not use this release until a person has read the changes.");
  process.exit(1);
}

const [command, serverScript] = process.argv.slice(2);
if (command === "record" && serverScript) await record(serverScript);
else if (command === "check" && serverScript) await check(serverScript);
else {
  console.log("Use: bun pins.ts record <server.ts>, or bun pins.ts check <server.ts>");
  process.exit(2);
}
