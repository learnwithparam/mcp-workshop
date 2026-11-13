// The same fingerprint as pin-third-party-tools: SHA-256 of the whole tool definition.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { UpstreamTool } from "./upstream";

/** The same value as JSON, with the keys of every object sorted, so the text is always the same. */
function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>);
  entries.sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey));
  const sortedEntries = entries.map(([key, inner]) => [key, withSortedKeys(inner)]);
  return Object.fromEntries(sortedEntries);
}

export function fingerprint(tool: UpstreamTool): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(withSortedKeys(tool), null, 2));
  return hash.digest("hex");
}

/** The fingerprints in pins.json, which the clinic wrote after it reviewed the lab's tools. */
export function pinnedFingerprints(): Set<string> {
  const pins = JSON.parse(readFileSync(new URL("./pins.json", import.meta.url), "utf8"));
  const tools = Object.values(pins.tools) as { fingerprint: string }[];
  return new Set(tools.map((tool) => tool.fingerprint));
}
