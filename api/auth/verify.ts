// POST /api/auth/verify { token } -> { email } and sets the session cookie.
// POST rather than GET so that link-prefetching mail clients cannot burn the one-time token.
import { consumePending, findOrCreateAccount, json, secret, sessionCookie, signSession } from "../../src/server/auth";

export async function POST(request: Request): Promise<Response> {
  let body: { token?: unknown };
  try { body = await request.json(); } catch { return json(400, { error: "bad json" }); }
  const token = typeof body.token === "string" ? body.token : "";
  const email = await consumePending(token);
  if (!email) return json(400, { error: "invalid or expired" });
  const acct = await findOrCreateAccount(email);
  return json(200, { email: acct.email }, { "set-cookie": sessionCookie(signSession(acct.uid, secret())) });
}
