// Talking to one upstream server: mint a token for it, connect, list tools, call a tool.
// The proxy never sends on the token it received. It mints a new one for each upstream, with that
// upstream's own URL as the audience. In a real clinic, the authorization server does this step
// (token exchange); here the course's signing key stands in for it.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { mintToken } from "../../../../world/auth";

export type Upstream = { prefix: string; url: string };
// inboundToken is the token the caller sent to the proxy. It is for the proxy only.
export type Caller = {
  staffId: string;
  role: string;
  site: string;
  scopes: string[];
  inboundToken?: string;
};
export type UpstreamTool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];

/** A token for this caller, valid only at this upstream. */
function tokenFor(caller: Caller, upstream: Upstream): Promise<string> {
  return mintToken({
    staffId: caller.staffId,
    role: caller.role,
    site: caller.site,
    scopes: caller.scopes,
    audience: upstream.url,
  });
}

async function connect(upstream: Upstream, caller: Caller): Promise<Client> {
  const token = await tokenFor(caller, upstream);
  const client = new Client(
    { name: "harrow-lane-proxy", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  const transport = new StreamableHTTPClientTransport(new URL(upstream.url), {
    // biome-ignore lint/style/useNamingConvention: HTTP header names are fixed by the standard
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

export async function listUpstreamTools(upstream: Upstream, caller: Caller) {
  const client = await connect(upstream, caller);
  try {
    const { tools } = await client.listTools();
    return tools;
  } finally {
    await client.close();
  }
}

export async function callUpstreamTool(
  upstream: Upstream,
  caller: Caller,
  call: { name: string; arguments: Record<string, unknown> },
) {
  const client = await connect(upstream, caller);
  try {
    return await client.callTool(call);
  } finally {
    await client.close();
  }
}
