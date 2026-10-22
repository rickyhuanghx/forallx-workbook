// DELETE /api/account -> removes the account record and its progress, clears the cookie.
import { accountByUid, clearCookie, crossSite, deleteAccount, json, uidFromRequest } from "../src/server/auth.js";

export async function DELETE(request: Request): Promise<Response> {
  if (crossSite(request)) return json(403, { error: "cross-site" });
  const uid = uidFromRequest(request);
  if (!uid) return json(401, { error: "signed out" });
  const acct = await accountByUid(uid);
  if (acct) await deleteAccount(acct);
  return json(200, { ok: true }, { "set-cookie": clearCookie() });
}
