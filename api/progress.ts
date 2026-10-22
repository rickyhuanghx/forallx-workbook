// Progress sync: one private JSON blob per sync code in Vercel Blob.
// GET  /api/progress  (header x-sync-code) -> { data, updated } or 404
// PUT  /api/progress  { code, data }       -> { updated }
// The code is a secret the learner holds; there are no accounts. Only the server holds the Blob token.
import { get, put } from "@vercel/blob";

const CODE = /^[a-z0-9]{20,64}$/;
const MAX_BYTES = 512 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const pathFor = (code: string) => `progress/${code}.json`;

export async function GET(request: Request): Promise<Response> {
  const code = request.headers.get("x-sync-code") ?? "";
  if (!CODE.test(code)) return json(400, { error: "bad code" });
  const r = await get(pathFor(code), { access: "private", useCache: false });
  if (!r) return json(404, { error: "not found" });
  const text = await new Response(r.stream).text();
  return new Response(text, { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function PUT(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BYTES) return json(413, { error: "too large" });
  let body: { code?: unknown; data?: unknown };
  try { body = JSON.parse(text); } catch { return json(400, { error: "bad json" }); }
  const code = typeof body.code === "string" ? body.code : "";
  if (!CODE.test(code)) return json(400, { error: "bad code" });
  if (!body.data || typeof body.data !== "object") return json(400, { error: "bad data" });
  const updated = Date.now();
  await put(pathFor(code), JSON.stringify({ data: body.data, updated }), {
    access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 0,
  });
  return json(200, { updated });
}
