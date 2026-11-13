// The clinic's sign-in service, as your server sees it. A step folder imports it with:
//   import { ISSUER, RESOURCE, readToken } from "../../clinic-login";
//
// ISSUER     the address of the clinic's authorization server, which signs every token.
// RESOURCE   this server's own URL, http://127.0.0.1:<MCP_PORT>/mcp. Tokens name it as their audience.
// readToken  checks a token's signature, issuer and expiry, then returns its claims.
//            It throws when any of them is wrong. It does NOT check the audience.
export { ISSUER, RESOURCE, ROLE_SCOPES, readToken } from "../../world/auth";
