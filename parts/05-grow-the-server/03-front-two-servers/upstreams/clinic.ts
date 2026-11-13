// The clinic's MCP server (the finished one), served as an upstream: PORT=8801 bun clinic.ts
import { callerFrom, createServer } from "../../../../world/finished/server";
import { serveUpstream } from "./serve-upstream";

serveUpstream({ name: "clinic", createServer: (auth) => createServer(callerFrom(auth)) });
