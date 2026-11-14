// Three safety checks a client makes before it trusts what a server tells it.
//   bun guards.ts url "<address>"            may the client fetch this address?
//   bun guards.ts iss '<json>'                does the sign-in answer come from the right place?
//   bun guards.ts client-metadata '<json>'    is our own client ID document well formed?
// Each prints "allow" and exits 0, or prints "reject: <reason>" and exits 1.
import { isIP } from "node:net";

type Verdict = { ok: true } | { ok: false; reason: string };
const allow: Verdict = { ok: true };
const refuse = (reason: string): Verdict => ({ ok: false, reason });

const PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
];
const PRIVATE_V6 = [/^::1?$/, /^fe80:/, /^f[cd]/, /^::ffff:/];
const INTERNAL_NAMES = [".localhost", ".local", ".internal"];

/** The host without the square brackets an address like [::1] has inside a URL. */
const bareHost = (hostname: string) => hostname.replace(/^\[|\]$/g, "").toLowerCase();

function isInternalHost(hostname: string): boolean {
  const host = bareHost(hostname);
  if (host === "localhost" || INTERNAL_NAMES.some((ending) => host.endsWith(ending))) return true;
  const kind = isIP(host);
  if (kind === 4) return PRIVATE_V4.some((pattern) => pattern.test(host));
  if (kind === 6) return PRIVATE_V6.some((pattern) => pattern.test(host));
  return false;
}

/** SSRF guard: a client must not fetch an address that a server chose and that points inside. */
export function checkFetchUrl(raw: string): Verdict {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return refuse("that is not an address");
  }
  if (url.protocol !== "https:") return refuse("only https addresses are fetched");
  if (url.username || url.password) return refuse("an address with a name or password is refused");
  if (isInternalHost(url.hostname)) return refuse("that address points to a private network");
  return allow;
}

type IssueInput = {
  metadataIssuer: string;
  issParameterSupported: boolean;
  responseIss?: string;
};

/** Mix-up guard (RFC 9207): iss in the sign-in answer must equal the issuer exactly. */
export function checkIssuer(input: IssueInput): Verdict {
  if (!input.issParameterSupported) return allow;
  if (input.responseIss === undefined)
    return refuse("the answer has no iss, but the server promised one");
  if (input.responseIss !== input.metadataIssuer)
    return refuse("iss is not the issuer in the metadata");
  return allow;
}

type ClientDocument = {
  // biome-ignore-start lint/style/useNamingConvention: OAuth field names are fixed by the standard
  client_id?: string;
  redirect_uris?: string[];
  token_endpoint_auth_method?: string;
  // biome-ignore-end lint/style/useNamingConvention: the OAuth field names end here
};

function redirectIsSafe(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

/** A Client ID Metadata Document: the client ID is its own https address, with a path. */
export function checkClientMetadata(input: { url: string; document: ClientDocument }): Verdict {
  const { url, document } = input;
  const address = new URL(url);
  if (address.protocol !== "https:" || address.pathname === "/" || address.hash) {
    return refuse("the client ID must be an https address with a path and no fragment");
  }
  if (document.client_id !== url)
    return refuse("client_id must be exactly the address of this document");
  if (document.token_endpoint_auth_method !== "none") {
    return refuse("a public document has no secret: token_endpoint_auth_method must be none");
  }
  const redirects = document.redirect_uris ?? [];
  if (redirects.length === 0 || !redirects.every(redirectIsSafe)) {
    return refuse("redirect_uris must be https, or http on this machine");
  }
  return allow;
}

function decide(command: string, argument: string): Verdict {
  if (command === "url") return checkFetchUrl(argument);
  if (command === "iss") return checkIssuer(JSON.parse(argument));
  if (command === "client-metadata") return checkClientMetadata(JSON.parse(argument));
  return refuse(`unknown command ${command}`);
}

if (import.meta.main) {
  const [command = "", argument = ""] = process.argv.slice(2);
  let verdict: Verdict;
  try {
    verdict = decide(command, argument);
  } catch {
    verdict = refuse("the input could not be read");
  }
  console.log(verdict.ok ? "allow" : `reject: ${verdict.reason}`);
  process.exit(verdict.ok ? 0 : 1);
}
