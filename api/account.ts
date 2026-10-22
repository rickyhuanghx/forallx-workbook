// DELETE /api/account -> removes the account record and its progress, clears the cookie.
import { accountByUid, clearCookie, deleteAccount, json, uidFromRequest } from "../src/server/auth";

export async function DELETE(request: Request): Promise<Response> {
  const uid = uidFromRequest(request);
  if (!uid) return json(401, { error: "signed out" });
  const acct = await accountByUid(uid);
  if (acct) await deleteAccount(acct);
  return json(200, { ok: true }, { "set-cookie": clearCookie() });
}
