// POST /api/auth/logout -> clears the session cookie.
import { clearCookie, crossSite, json } from "../../src/server/auth.js";

export async function POST(request: Request): Promise<Response> {
  if (crossSite(request)) return json(403, { error: "cross-site" });
  return json(200, { ok: true }, { "set-cookie": clearCookie() });
}
