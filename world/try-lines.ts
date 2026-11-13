// The lines `bun run try` prints. Kept apart from try.ts so a test can check them.

// "The finished server, as ola, has 1 tool:" or "... has 6 tools:"
export function toolCountLine(serverName: string, count: number): string {
  return `${serverName} has ${count} tool${count === 1 ? "" : "s"}:`;
}

// The line shown when the server answers with a protocol error.
export function protocolErrorLine(message: string): string {
  return `The server broke the MCP rules: ${message}. Check the server's terminal for the cause.`;
}
