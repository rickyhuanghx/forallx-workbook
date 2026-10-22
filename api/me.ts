// GET /api/me -> { email } for the signed-in user, else 401.
import { accountByUid, json, uidFromRequest } from "../src/server/auth.js";

export async function GET(request: Request): Promise<Response> {
  const uid = uidFromRequest(request);
  if (!uid) return json(401, { error: "signed out" });
  const acct = await accountByUid(uid);
  if (!acct) return json(401, { error: "signed out" });
  return json(200, { email: acct.email });
}
