// upgrade-a-v1-server: the old Millbrook server, moved from SDK version 1 to version 2. No old
// import and no codemod marker may be left, and the server must pass every expose-the-diary rule
// from Part 1, so it speaks the 2026-07-28 protocol too.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import exposeTheDiaryRules from "./expose-the-diary";
import { rule } from "./lib/rules";

/** The text of every TypeScript and JavaScript file in the folder. */
function codeIn(dir: string): string {
  if (!existsSync(dir)) return "";
  const codeFiles = readdirSync(dir).filter((file) => /\.(ts|js|mjs)$/.test(file));
  return codeFiles.map((file) => readFileSync(join(dir, file), "utf8")).join("\n");
}

// Each Part 1 rule runs as it is, with "Part 1:" in front, so the learner sees which one fails.
const partOneRules = exposeTheDiaryRules.map((partOneRule) =>
  rule(`Part 1: ${partOneRule.says}`, partOneRule.test, () => partOneRule.tryNext),
);

export default [
  rule(
    'No import from the old "@modelcontextprotocol/sdk" package is left',
    async (dir) => {
      const code = codeIn(dir);
      return code.length > 0 && !code.includes('"@modelcontextprotocol/sdk');
    },
    "run the codemod in this folder: bunx @modelcontextprotocol/codemod@2.4.0 v1-to-v2 server.ts",
  ),
  rule(
    "No @mcp-codemod-error marker is left",
    async (dir) => !codeIn(dir).includes("@mcp-codemod-error"),
    "read each marker, fix the code by hand, then delete the marker comment",
  ),
  ...partOneRules,
];
