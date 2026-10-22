// Server-side helpers for email sign-in (magic links) and sessions. Used by the functions in api/.
// Storage is Vercel Blob (private store):
//   account/<sha256(email)>.json   { uid, email, created }
//   progress/u_<uid>.json          { data, updated }        (account progress)
//   progress/<code>.json           { data, updated }        (legacy sync-code progress)
//   auth/pending/<sha256(token)>.json { email, exp }        (one magic link, 15 minutes)
//   auth/rl/<bucket>.json          { n }                    (rate-limit counters)
// Secrets never leave the server: AUTH_SECRET signs sessions, BLOB_READ_WRITE_TOKEN reads the store,
// RESEND_API_KEY sends mail. Session cookie: forallx_session=v1.<uid>.<exp>.<hmac>, HttpOnly.
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { del, get, put } from "@vercel/blob";

export const COOKIE = "forallx_session";
export const SESSION_DAYS = 180;
export const LINK_MINUTES = 15;
export const PER_EMAIL_PER_HOUR = 5;
export const GLOBAL_PER_DAY = 300;
export const CONTACT = "hh695@cam.ac.uk";

export const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

// ------------------------------------------------------------------ pure helpers (unit-tested)

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const b64url = (b: Buffer) => b.toString("base64url");

export function normalizeEmail(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const e = s.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return null;
  return e;
}

export function signSession(uid: string, secret: string, now = Date.now(), days = SESSION_DAYS): string {
  const exp = now + days * 86400_000;
  const body = `v1.${uid}.${exp}`;
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined | null, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, uid, expS, sig] = parts;
  if (!/^[a-f0-9]{24}$/.test(uid)) return null;
  const exp = Number(expS);
  if (!Number.isFinite(exp) || exp < now) return null;
  const expect = b64url(createHmac("sha256", secret).update(`v1.${uid}.${exp}`).digest());
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return uid;
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token: string, days = SESSION_DAYS): string {
  return `${COOKIE}=${token}; Path=/; Max-Age=${days * 86400}; HttpOnly; Secure; SameSite=Lax`;
}
export function clearCookie(): string {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export const newToken = () => b64url(randomBytes(32));   // 43 chars, 256 bits
export const newUid = () => randomBytes(12).toString("hex");  // 24 hex chars

export const progressPathForUid = (uid: string) => `progress/u_${uid}.json`;
export const progressPathForCode = (code: string) => `progress/${code}.json`;

// ------------------------------------------------------------------ blob

export async function readJson<T>(path: string): Promise<T | null> {
  const r = await get(path, { access: "private", useCache: false });
  if (!r) return null;
  const text = await new Response(r.stream).text();
  try { return JSON.parse(text) as T; } catch { return null; }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await put(path, JSON.stringify(value), {
    access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 0,
  });
}

export async function deletePath(path: string): Promise<void> {
  try { await del(path); } catch { /* already gone */ }
}

// ------------------------------------------------------------------ sessions

export function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET missing");
  return s;
}

/** The signed-in user's id from the request cookie, or null. */
export function uidFromRequest(request: Request): string | null {
  const c = parseCookies(request.headers.get("cookie"));
  try { return verifySession(c[COOKIE], secret()); } catch { return null; }
}

export interface Account { uid: string; email: string; created: number }

export async function findAccount(email: string): Promise<Account | null> {
  return readJson<Account>(`account/${sha256(email)}.json`);
}

export async function findOrCreateAccount(email: string): Promise<Account> {
  const existing = await findAccount(email);
  if (existing) return existing;
  const acct: Account = { uid: newUid(), email, created: Date.now() };
  await writeJson(`account/${sha256(email)}.json`, acct);
  await writeJson(`account/by-uid/${acct.uid}.json`, acct);
  return acct;
}

export async function accountByUid(uid: string): Promise<Account | null> {
  return readJson<Account>(`account/by-uid/${uid}.json`);
}

export async function deleteAccount(acct: Account): Promise<void> {
  await deletePath(progressPathForUid(acct.uid));
  await deletePath(`account/by-uid/${acct.uid}.json`);
  await deletePath(`account/${sha256(acct.email)}.json`);
}

// ------------------------------------------------------------------ magic links

export interface Pending { email: string; exp: number }

export async function createPending(email: string): Promise<string> {
  const token = newToken();
  await writeJson(`auth/pending/${sha256(token)}.json`, { email, exp: Date.now() + LINK_MINUTES * 60_000 } satisfies Pending);
  return token;
}

/** Consume a magic-link token: returns the email, or null if unknown, expired or already used. */
export async function consumePending(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const path = `auth/pending/${sha256(token)}.json`;
  const p = await readJson<Pending>(path);
  if (!p) return null;
  await deletePath(path);
  if (p.exp < Date.now()) return null;
  return p.email;
}

/** Counter-based rate limit. Racy under concurrency, which is fine at this traffic. */
export async function overLimit(email: string): Promise<boolean> {
  const now = new Date();
  const hour = `${now.toISOString().slice(0, 13)}`;
  const day = now.toISOString().slice(0, 10);
  const perEmail = `auth/rl/${sha256(email)}-${hour}.json`;
  const global = `auth/rl/global-${day}.json`;
  const [e, g] = await Promise.all([readJson<{ n: number }>(perEmail), readJson<{ n: number }>(global)]);
  const en = (e?.n ?? 0) + 1, gn = (g?.n ?? 0) + 1;
  await Promise.all([writeJson(perEmail, { n: en }), writeJson(global, { n: gn })]);
  return en > PER_EMAIL_PER_HOUR || gn > GLOBAL_PER_DAY;
}

// ------------------------------------------------------------------ mail

export function signInEmail(link: string): { subject: string; text: string; html: string } {
  const subject = "Your sign-in link for the forall x workbook";
  const text = [
    "Click this link to sign in to the forall x workbook:",
    "",
    link,
    "",
    `The link works once and expires in ${LINK_MINUTES} minutes. If you did not ask for it, you can ignore this email; nothing has changed on your account.`,
    "",
    `This is a free, independent study edition of forall x: Calgary. Questions: ${CONTACT}`,
  ].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#17171c;max-width:36em;margin:0 auto;padding:24px 16px;line-height:1.5">
<p>Click this link to sign in to the forall x workbook:</p>
<p><a href="${esc(link)}" style="display:inline-block;padding:10px 16px;background:#17171c;color:#f5f5f1;text-decoration:none;border-radius:4px">Sign in</a></p>
<p style="font-size:14px;color:#4b4b54">Or paste this into your browser:<br>${esc(link)}</p>
<p style="font-size:14px;color:#4b4b54">The link works once and expires in ${LINK_MINUTES} minutes. If you did not ask for it, you can ignore this email; nothing has changed on your account.</p>
<p style="font-size:13px;color:#7a7a84">This is a free, independent study edition of <i>forall x: Calgary</i>. Questions: ${CONTACT}</p>
</body></html>`;
  return { subject, text, html };
}

export async function sendMail(to: string, msg: { subject: string; text: string; html: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) throw new Error("mail not configured");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], reply_to: CONTACT, subject: msg.subject, text: msg.text, html: msg.html }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export function appUrl(request: Request): string {
  const env = process.env.APP_URL;
  if (env) return env.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  return `https://${host}`;
}
