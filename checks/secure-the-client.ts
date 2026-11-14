// secure-the-client: guards.ts holds three safety checks a client makes before it trusts a server:
// which addresses it may fetch (SSRF), whether the sign-in answer names the right issuer (iss), and
// whether its own client ID document is well formed. The check runs guards.ts as a program, once
// per case, and reads "allow" or "reject".
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { rule } from "./lib/rules";

type Case = { command: string; input: string; allowed: boolean; why: string };

const ISSUER = "https://auth.harrowlane.example";
const SELF = "https://client.harrowlane.example/oauth/client.json";
const GOOD_DOCUMENT = {
  // biome-ignore-start lint/style/useNamingConvention: OAuth field names are fixed by the standard
  client_id: SELF,
  redirect_uris: ["http://127.0.0.1:8123/callback"],
  token_endpoint_auth_method: "none",
  // biome-ignore-end lint/style/useNamingConvention: the OAuth field names end here
};

const url = (input: string, allowed: boolean, why: string): Case => ({
  command: "url",
  input,
  allowed,
  why,
});
const iss = (
  responseIss: string | undefined,
  supported: boolean,
  allowed: boolean,
  why: string,
) => ({
  command: "iss",
  input: JSON.stringify({ metadataIssuer: ISSUER, issParameterSupported: supported, responseIss }),
  allowed,
  why,
});
const document = (changes: Record<string, unknown>, allowed: boolean, why: string): Case => ({
  command: "client-metadata",
  input: JSON.stringify({ url: SELF, document: { ...GOOD_DOCUMENT, ...changes } }),
  allowed,
  why,
});

const FETCH_ALLOWED = [
  url(`${ISSUER}/.well-known/oauth-authorization-server`, true, "a public https address"),
];
const FETCH_REFUSED = [
  url("http://auth.harrowlane.example/metadata", false, "plain http"),
  url("https://127.0.0.1/metadata", false, "this machine"),
  url("https://localhost/metadata", false, "localhost"),
  url("https://10.0.0.5/metadata", false, "a private 10 address"),
  url("https://192.168.1.20/metadata", false, "a private 192.168 address"),
  url("https://172.20.0.9/metadata", false, "a private 172 address"),
  url("https://169.254.169.254/latest/meta-data", false, "the cloud metadata address"),
  url("https://[::1]/metadata", false, "the IPv6 loopback"),
  url("https://2130706433/metadata", false, "127.0.0.1 written as one number"),
  url("https://[::ffff:127.0.0.1]/metadata", false, "127.0.0.1 inside an IPv6 address"),
  url("https://admin:secret@auth.harrowlane.example/", false, "a name and password in the address"),
  url("https://billing.internal/metadata", false, "an internal name"),
];
const ISS_ALLOWED = [
  iss(ISSUER, true, true, "iss matches"),
  iss(undefined, false, true, "the server never promised an iss"),
];
const ISS_REFUSED = [
  iss(undefined, true, false, "iss is missing but promised"),
  iss("https://evil.example", true, false, "iss names another server"),
  iss(`${ISSUER}/`, true, false, "iss has an extra slash"),
  iss(`${ISSUER}.evil.example`, true, false, "iss only starts the same"),
];
const DOCUMENT_ALLOWED = [document({}, true, "a good document")];
// biome-ignore-start lint/style/useNamingConvention: OAuth field names are fixed by the standard
const DOCUMENT_REFUSED = [
  document(
    { client_id: "https://client.harrowlane.example/other.json" },
    false,
    "client_id is another address",
  ),
  document({ token_endpoint_auth_method: "client_secret_basic" }, false, "it asks for a secret"),
  document(
    { redirect_uris: ["http://client.harrowlane.example/callback"] },
    false,
    "http redirect off this machine",
  ),
  document({ redirect_uris: [] }, false, "no redirect address"),
];
// biome-ignore-end lint/style/useNamingConvention: the OAuth field names end here

/** Runs guards.ts for one case and says whether it printed allow. */
async function answers(dir: string, test: Case): Promise<boolean | undefined> {
  const script = join(resolve(dir), "guards.ts");
  if (!existsSync(script)) return undefined;
  const run = Bun.spawn([process.execPath, script, test.command, test.input], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = (await new Response(run.stdout).text()).trim();
  await run.exited;
  if (output === "allow") return true;
  return output.startsWith("reject") ? false : undefined;
}

/** Every case gets the answer it should. The rule's try-next names the first one that did not. */
function allCorrect(cases: Case[]) {
  return async (dir: string) => {
    for (const test of cases) {
      if ((await answers(dir, test)) !== test.allowed) {
        wrongCase = test.why;
        return false;
      }
    }
    return true;
  };
}

let wrongCase = "";
const tryNext = (advice: string) => () => `${advice}. First wrong answer: ${wrongCase}`;

export default [
  rule(
    "A public https address is fetched",
    allCorrect(FETCH_ALLOWED),
    tryNext("the guard must not refuse everything"),
  ),
  rule(
    "An address that points inside, or is not plain https, is refused",
    allCorrect(FETCH_REFUSED),
    tryNext(
      "refuse http, a name and password, localhost, private and link-local numbers, IPv6 tricks",
    ),
  ),
  rule(
    "The iss check accepts a match and refuses a missing, wrong or look-alike iss",
    allCorrect([...ISS_ALLOWED, ...ISS_REFUSED]),
    tryNext(
      "compare iss with the issuer in the metadata, letter for letter, if the server promised one",
    ),
  ),
  rule(
    "Our client ID document is accepted when it is good and refused when it is not",
    allCorrect([...DOCUMENT_ALLOWED, ...DOCUMENT_REFUSED]),
    tryNext("client_id equals the address, no secret, redirects are https or on this machine"),
  ),
];
