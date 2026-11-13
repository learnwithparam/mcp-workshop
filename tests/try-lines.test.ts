// The try tool reads "1 tool" and "6 tools" correctly, and points to the server terminal on errors.
import { expect, test } from "bun:test";
import { protocolErrorLine, toolCountLine } from "../world/try-lines";

test("the tool count uses the singular for one tool and the plural otherwise", () => {
  expect(toolCountLine("The finished server, as ola,", 1)).toBe(
    "The finished server, as ola, has 1 tool:",
  );
  expect(toolCountLine("The finished server, as ola,", 6)).toBe(
    "The finished server, as ola, has 6 tools:",
  );
  expect(toolCountLine("The server in step-1,", 0)).toBe("The server in step-1, has 0 tools:");
});

test("a protocol error says the server broke the rules and where to look", () => {
  expect(protocolErrorLine("Method not found")).toBe(
    "The server broke the MCP rules: Method not found. Check the server's terminal for the cause.",
  );
});
