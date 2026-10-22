// Progress sync: one private JSON blob per learner in Vercel Blob.
// Signed in (session cookie): the blob is keyed by account id.
// Otherwise a sync code (header x-sync-code on GET, body.code on PUT) names the blob; the code is a secret the learner holds.
// GET  /api/progress -> { data, updated } or 404
// PUT  /api/progress { data, code? } -> { updated }
import { json, progressPathForCode, progressPathForUid, readJson, uidFromRequest, writeJson } from "../src/server/auth";

const CODE = /^[a-z0-9]{20,64}$/;
const MAX_BYTES = 512 * 1024;

function pathFor(request: Request, code: string): Response | string {
  const uid = uidFromRequest(request);
  if (uid) return progressPathForUid(uid);
  if (CODE.test(code)) return progressPathForCode(code);
  return json(401, { error: "signed out" });
}

export async function GET(request: Request): Promise<Response> {
  const path = pathFor(request, request.headers.get("x-sync-code") ?? "");
  if (path instanceof Response) return path;
  const r = await readJson<unknown>(path);
  if (!r) return json(404, { error: "not found" });
  return json(200, r);
}

export async function PUT(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BYTES) return json(413, { error: "too large" });
  let body: { code?: unknown; data?: unknown };
  try { body = JSON.parse(text); } catch { return json(400, { error: "bad json" }); }
  const path = pathFor(request, typeof body.code === "string" ? body.code : "");
  if (path instanceof Response) return path;
  if (!body.data || typeof body.data !== "object") return json(400, { error: "bad data" });
  const updated = Date.now();
  await writeJson(path, { data: body.data, updated });
  return json(200, { updated });
}
