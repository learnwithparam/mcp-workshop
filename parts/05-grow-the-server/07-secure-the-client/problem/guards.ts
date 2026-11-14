// Three safety checks a client makes before it trusts what a server tells it.
//   bun guards.ts url "<address>"            may the client fetch this address?
//   bun guards.ts iss '<json>'                does the sign-in answer come from the right place?
//   bun guards.ts client-metadata '<json>'    is our own client ID document well formed?
// Each prints "allow" and exits 0, or prints "reject: <reason>" and exits 1.
//
// TODO: every guard below allows everything. Make each one refuse what the README lists.

type Verdict = { ok: true } | { ok: false; reason: string };
const allow: Verdict = { ok: true };
const refuse = (reason: string): Verdict => ({ ok: false, reason });

/** SSRF guard: refuse an address that a server chose and that points to a private network. */
export function checkFetchUrl(_raw: string): Verdict {
  return allow;
}

/** Mix-up guard (RFC 9207): the iss in the sign-in answer must equal the issuer in the metadata. */
export function checkIssuer(_input: {
  metadataIssuer: string;
  issParameterSupported: boolean;
  responseIss?: string;
}): Verdict {
  return allow;
}

/** The client ID document: its client_id is its own https address, with a path. */
export function checkClientMetadata(_input: { url: string; document: object }): Verdict {
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
