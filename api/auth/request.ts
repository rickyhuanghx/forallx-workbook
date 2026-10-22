// POST /api/auth/request { email } -> { ok: true }. Emails a one-time sign-in link.
import { appUrl, clientBucket, createPending, crossSite, json, normalizeEmail, overLimit, sendMail, signInEmail } from "../../src/server/auth.js";

export async function POST(request: Request): Promise<Response> {
  if (crossSite(request)) return json(403, { error: "cross-site" });
  let body: { email?: unknown };
  try { body = (await request.json()) ?? {}; } catch { return json(400, { error: "bad json" }); }
  const email = normalizeEmail(body.email);
  if (!email) return json(400, { error: "bad email" });
  if (await overLimit(email, clientBucket(request))) return json(429, { error: "too many requests" });
  const token = await createPending(email);
  const link = `${appUrl(request)}/login?token=${token}`;
  try {
    await sendMail(email, signInEmail(link));
  } catch (e) {
    console.error("sign-in mail failed", (e as Error).message);
    return json(502, { error: "mail failed" });
  }
  return json(200, { ok: true });
}
