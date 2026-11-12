// The course's stand-in for the clinic's identity provider. It mints signed access tokens for the demo staff.
// The key below is for this local course only. A real server verifies tokens from a real authorization server.
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

export async function mintToken(opts: {
  staff_id: string;
  role: string;
  site: string;
  audience?: string;
  scopes?: string[];
  expiresIn?: string;
}) {
  return new SignJWT({
    scope: (opts.scopes ?? ROLE_SCOPES[opts.role]).join(" "),
    role: opts.role,
    site: opts.site,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(opts.staff_id)
    .setAudience(opts.audience ?? RESOURCE)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "8h")
    .sign(KEY);
}

export async function readToken(token: string) {
  const { payload } = await jwtVerify(token, KEY, { issuer: ISSUER });
  return payload as {
    sub: string;
    aud: string | string[];
    exp: number;
    scope: string;
    role: string;
    site: string;
  };
}
