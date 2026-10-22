// GET /api/cron/cleanup, run daily by Vercel Cron (vercel.json). Deletes sign-in links nobody used and
// rate-limit counters, so neither outlives two days. Vercel sends Authorization: Bearer $CRON_SECRET.
import { json, sweep } from "../../src/server/auth.js";

export async function GET(request: Request): Promise<Response> {
  const want = process.env.CRON_SECRET;
  if (!want || request.headers.get("authorization") !== `Bearer ${want}`) return json(401, { error: "unauthorized" });
  const before = Date.now() - 2 * 86400_000;
  const [pending, counters] = await Promise.all([sweep("auth/pending/", before), sweep("auth/rl/", before)]);
  return json(200, { pending, counters });
}
