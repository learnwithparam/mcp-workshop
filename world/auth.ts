// The course's stand-in for the clinic's identity provider. It signs access tokens for the demo
// staff. The key below is for this local course only. A real server checks tokens that come from
// a real authorization server.
import { jwtVerify, SignJWT } from "jose";

export const ISSUER = "https://login.harrowlane.test";
export const PORT = Number(process.env.MCP_PORT ?? 8787);
export const RESOURCE = `http://127.0.0.1:${PORT}/mcp`;
const KEY = new TextEncoder().encode("harrow-lane-course-signing-key-local-only-0001");

export const ROLE_SCOPES: Record<string, string[]> = {
  receptionist: ["diary:read", "diary:write"],
  nurse: ["diary:read", "diary:write", "notes:read"],
  vet: ["diary:read", "diary:write", "notes:read"],
  director: ["diary:read", "diary:write", "notes:read", "drugs:read"],
};

// Short names the course uses for the three demo staff.
export const DEMO = { ola: "S-08", sam: "S-05", joon: "S-01" } as const;

export type TokenRequest = {
  staffId: string;
  role: string;
  site: string;
  audience?: string;
  scopes?: string[];
  expiresIn?: string;
};

export type TokenClaims = {
  sub: string;
  aud: string | string[];
  exp: number;
  scope: string;
  role: string;
  site: string;
};

export async function mintToken(request: TokenRequest) {
  const scopes = request.scopes ?? ROLE_SCOPES[request.role];
  const claims = { scope: scopes.join(" "), role: request.role, site: request.site };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(request.staffId)
    .setAudience(request.audience ?? RESOURCE)
    .setIssuedAt()
    .setExpirationTime(request.expiresIn ?? "8h")
    .sign(KEY);
}

export async function readToken(token: string) {
  const { payload } = await jwtVerify(token, KEY, { issuer: ISSUER });
  return payload as TokenClaims;
}
