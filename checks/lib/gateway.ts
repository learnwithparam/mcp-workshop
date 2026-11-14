// Starts the assignment's compose file and talks to agentgateway the way a learner's client would.
// The signing key is made fresh on every run and never written inside the repo.
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { ISSUER, mintToken } from "../../world/auth";
import { STAFF } from "../../world/seed";

export const ASSIGNMENT_DIR = join(import.meta.dir, "..", "..", "assignment");
export const GATEWAY_URL = "http://127.0.0.1:3000/mcp";
export const GATEWAY_IMAGE = "cr.agentgateway.dev/agentgateway:v1.7.0";
const COMPOSE_FILE = join(ASSIGNMENT_DIR, "compose.yml");
const UPSTREAM_PORTS = { clinic: 8801, lab: 8802 };
const START_TIMEOUT_MS = 60000;

export type Gateway = { callerToken: string; stop: () => Promise<void> };

/** Writes the public keys and the three tokens into `runDir`. Returns the caller's token. */
export async function writeRunFiles(runDir: string): Promise<string> {
  mkdirSync(runDir, { recursive: true });
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = { ...(await exportJWK(publicKey)), alg: "RS256", use: "sig", kid: "course" };
  writeFileSync(join(runDir, "public-keys.jwks"), JSON.stringify({ keys: [publicJwk] }));
  const callerToken = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "course" })
    .setIssuer(ISSUER)
    .setSubject("S-01")
    .setAudience(GATEWAY_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
  writeFileSync(join(runDir, "caller.token"), callerToken);
  // The course servers only accept a token made for their own address, so each gets its own.
  const joon = STAFF.find((person) => person.id === "S-01");
  for (const [name, port] of Object.entries(UPSTREAM_PORTS)) {
    const audience = `http://127.0.0.1:${port}/mcp`;
    const token = await mintToken({
      staffId: "S-01",
      role: joon?.role ?? "director",
      site: joon?.site ?? "harrow-lane",
      audience,
      expiresIn: "1h",
    });
    writeFileSync(join(runDir, `${name}.token`), token);
  }
  // The gateway container runs as another user, so the folder and files must be readable.
  chmodSync(runDir, 0o755);
  return callerToken;
}

async function compose(project: string, env: Record<string, string>, args: string[]) {
  const command = ["docker", "compose", "-p", project, "-f", COMPOSE_FILE, ...args];
  const child = Bun.spawn(command, {
    env: { ...(Bun.env as Record<string, string>), ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await child.exited;
  return { code: child.exitCode ?? 1, text: out + err };
}

/** Connects as an MCP client with a token. Retries until the gateway and both servers are up. */
export async function connectThrough(token: string): Promise<Client> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  let lastError = new Error("the gateway never answered on port 3000");
  while (Date.now() < deadline) {
    const client = new Client({ name: "agentgateway-check", version: "1.0.0" });
    // biome-ignore lint/style/useNamingConvention: HTTP header names are fixed by the standard
    const requestInit = { headers: { Authorization: `Bearer ${token}` } };
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(GATEWAY_URL), { requestInit }),
      );
      await client.listTools();
      return client;
    } catch (error) {
      lastError = error as Error;
      await client.close().catch(() => {});
      await Bun.sleep(500);
    }
  }
  throw lastError;
}

/** Starts the compose stack with the config in `configDir`. Always call `stop` afterwards. */
export async function startGateway(configDir: string): Promise<Gateway> {
  const runDir = mkdtempSync(join(tmpdir(), "agentgateway-run-"));
  const callerToken = await writeRunFiles(runDir);
  const project = `mcpgateway${process.pid}`;
  // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
  const env = { GATEWAY_CONFIG: join(configDir, "config.yaml"), GATEWAY_RUN_DIR: runDir };
  const stop = async () => {
    await compose(project, env, ["down", "-v", "--remove-orphans"]);
  };
  const started = await compose(project, env, ["up", "-d"]);
  if (started.code !== 0) {
    await stop();
    throw new Error(`docker compose could not start: ${started.text.slice(-300)}`);
  }
  return { callerToken, stop };
}

/** The version the gateway image reports about itself, read by running the image. */
export async function imageVersion(): Promise<string> {
  const child = Bun.spawn(["docker", "run", "--rm", GATEWAY_IMAGE, "--version"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const text = await new Response(child.stdout).text();
  await child.exited;
  return (JSON.parse(text) as { version: string }).version;
}
