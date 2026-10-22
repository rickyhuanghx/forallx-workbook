// POST /api/auth/logout -> clears the session cookie.
import { clearCookie, json } from "../../src/server/auth.js";

export async function POST(): Promise<Response> {
  return json(200, { ok: true }, { "set-cookie": clearCookie() });
}
