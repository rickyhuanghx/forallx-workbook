// Progress sync: one private JSON blob per learner in Vercel Blob.
// Signed in (session cookie): the blob is keyed by account id, and only while the account exists, so another
// device still holding a cookie cannot recreate progress after the account was deleted.
// Otherwise a sync code (header x-sync-code on GET, body.code on PUT) names the blob; the code is a secret the learner holds.
// Creating a blob for a new code is limited per client per day; updating an existing one is not.
// GET  /api/progress -> { data, updated } or 404
// PUT  /api/progress { data, code? } -> { updated }
import {
  accountByUid, clearCookie, clientBucket, crossSite, exists, json, overCodeLimit, progressPathForCode, progressPathForUid, readJson,
  uidFromRequest, writeJson,
} from "../src/server/auth.js";

const CODE = /^[a-z0-9]{20,64}$/;
const MAX_BYTES = 512 * 1024;

async function pathFor(request: Request, code: string): Promise<Response | { path: string; kind: "account" | "code" }> {
  const uid = uidFromRequest(request);
  if (uid) {
    if (!(await accountByUid(uid))) return json(401, { error: "signed out" }, { "set-cookie": clearCookie() });
    return { path: progressPathForUid(uid), kind: "account" };
  }
  if (CODE.test(code)) return { path: progressPathForCode(code), kind: "code" };
  return json(401, { error: "signed out" });
}

export async function GET(request: Request): Promise<Response> {
  const t = await pathFor(request, request.headers.get("x-sync-code") ?? "");
  if (t instanceof Response) return t;
  const r = await readJson<unknown>(t.path);
  if (!r) return json(404, { error: "not found" });
  return json(200, r);
}

export async function PUT(request: Request): Promise<Response> {
  if (crossSite(request)) return json(403, { error: "cross-site" });
  const text = await request.text();
  if (text.length > MAX_BYTES) return json(413, { error: "too large" });
  let body: { code?: unknown; data?: unknown };
  try { body = JSON.parse(text) ?? {}; } catch { return json(400, { error: "bad json" }); }
  const t = await pathFor(request, typeof body.code === "string" ? body.code : "");
  if (t instanceof Response) return t;
  if (!body.data || typeof body.data !== "object") return json(400, { error: "bad data" });
  if (t.kind === "code" && !(await exists(t.path)) && (await overCodeLimit(clientBucket(request)))) {
    return json(429, { error: "too many new sync codes" });
  }
  const updated = Date.now();
  await writeJson(t.path, { data: body.data, updated });
  return json(200, { updated });
}
