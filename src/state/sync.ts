// Cross-device sync of the learner's progress through /api/progress, keyed by a secret sync code
// kept in localStorage. Local storage stays the source of truth; the server copy is merged in.
import { useEffect, useState } from "react";
import { getProgress, mergeProgress, onProgressSaved, replaceProgress, setClockOffset, type Progress } from "./progress";

const CODE_KEY = "forallx-sync-code";
const ACCOUNT_KEY = "forallx-account";
const ENDPOINT = "/api/progress";

export interface SyncStatus {
  state: "off" | "syncing" | "synced" | "error";
  at?: number;          // last successful sync
  error?: string;
}

let status: SyncStatus = { state: "off" };
const listeners = new Set<() => void>();
function setStatus(s: SyncStatus) { status = s; listeners.forEach((l) => l()); }

export function getSyncCode(): string | null {
  try { return localStorage.getItem(CODE_KEY); } catch { return null; }
}
function setSyncCode(code: string | null) {
  try { if (code) localStorage.setItem(CODE_KEY, code); else localStorage.removeItem(CODE_KEY); } catch { /* ignore */ }
}

/** Email of the signed-in account as this browser last saw it (the cookie is the real session). */
export function getAccountEmail(): string | null {
  try { return localStorage.getItem(ACCOUNT_KEY); } catch { return null; }
}
function setAccountEmail(email: string | null) {
  try { if (email) localStorage.setItem(ACCOUNT_KEY, email); else localStorage.removeItem(ACCOUNT_KEY); } catch { /* ignore */ }
}

type Target = { kind: "account" } | { kind: "code"; code: string };
/** Where this browser syncs to: the signed-in account first, otherwise a sync code, otherwise nowhere. */
function target(): Target | null {
  if (getAccountEmail()) return { kind: "account" };
  const code = getSyncCode();
  return code ? { kind: "code", code } : null;
}

export function newSyncCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Group a code in fours for reading aloud or copying. */
export function formatCode(code: string): string { return code.replace(/(.{4})(?=.)/g, "$1 "); }
export function normalizeCode(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); }

// ------------------------------------------------------------------ merge (pure)

// The merge lives in progress.ts, where other tabs are merged in too; re-exported for callers and tests.
export { mergeProgress } from "./progress";

// ------------------------------------------------------------------ transport

class SignedOut extends Error { constructor() { super("signed out"); } }

/** A 401 in account mode means the session cookie is gone: forget the account locally. */
function signedOutLocally() {
  setAccountEmail(null);
  setStatus({ state: "off" });
}

/** Server clock minus this device's, from the Date header, so a device with a wrong clock stamps records sensibly. */
function measureClock(r: Response, sentAt: number) {
  const d = Date.parse(r.headers.get("date") ?? "");
  if (Number.isFinite(d)) setClockOffset(d + 500 - (sentAt + Date.now()) / 2);
}

class TooLarge extends Error { constructor() { super("Your saved progress is too large to sync. Export a backup on this page, then remove old Lab work."); } }

async function fetchRemote(t: Target): Promise<{ data: Progress; updated: number } | null> {
  // a sync code travels in a header, not the URL, so it stays out of request logs
  const headers: Record<string, string> = t.kind === "code" ? { "x-sync-code": t.code } : {};
  const sentAt = Date.now();
  const r = await fetch(ENDPOINT, { cache: "no-store", headers, credentials: "same-origin" });
  measureClock(r, sentAt);
  if (r.status === 404) return null;
  if (r.status === 401 && t.kind === "account") throw new SignedOut();
  if (!r.ok) throw new Error(`server ${r.status}`);
  return r.json();
}

async function pushRemote(t: Target, data: Progress): Promise<number> {
  const body = t.kind === "code" ? { code: t.code, data } : { data };
  const r = await fetch(ENDPOINT, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  if (r.status === 401 && t.kind === "account") throw new SignedOut();
  if (r.status === 413) throw new TooLarge();
  if (!r.ok) throw new Error(`server ${r.status}`);
  return (await r.json()).updated as number;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let dirty = false;

function schedulePush(delay = 1500) {
  if (!target()) return;
  dirty = true;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void pushNow(); }, delay);
}

/**
 * Upload local changes. The server keeps one whole copy, so this always reads and merges the server copy first
 * (pullAndMerge); a blind upload would erase whatever another device saved since this one last pulled.
 */
async function pushNow(): Promise<void> {
  if (!target() || pushing) return;
  pushing = true;
  dirty = false;
  try {
    await pullAndMerge();
    if (status.state === "error" && !tooLarge) dirty = true;
  } finally {
    pushing = false;
    if (dirty) schedulePush(5000);
  }
}
let tooLarge = false;

/** Pull the server copy, merge it into local storage, and push the result if anything differed. */
export async function pullAndMerge(): Promise<void> {
  const t = target();
  if (!t) return;
  setStatus({ state: "syncing", at: status.at });
  tooLarge = false;
  try {
    const remote = await fetchRemote(t);
    const local = getProgress();
    const merged = remote ? mergeProgress(local, remote.data) : local;
    const localJson = JSON.stringify(local);
    if (JSON.stringify(merged) !== localJson) replaceProgress(merged, { silent: true });
    if (!remote || JSON.stringify(remote.data) !== JSON.stringify(merged)) {
      const at = await pushRemote(t, merged);
      setStatus({ state: "synced", at });
    } else {
      setStatus({ state: "synced", at: remote.updated });
    }
  } catch (e) {
    if (e instanceof SignedOut) { dirty = false; signedOutLocally(); return; }
    tooLarge = e instanceof TooLarge;
    setStatus({ state: "error", at: status.at, error: (e as Error).message });
  }
}

/** Turn sync on for this browser with a fresh code, and upload what is here. */
export async function enableSync(): Promise<string> {
  const code = newSyncCode();
  setSyncCode(code);
  await pullAndMerge();
  return code;
}

/** Join an existing code from another device: merge its progress with what is here. */
export async function joinSync(input: string): Promise<"ok" | "notfound" | "error"> {
  const code = normalizeCode(input);
  if (!/^[a-z0-9]{20,64}$/.test(code)) return "notfound";
  try {
    const remote = await fetchRemote({ kind: "code", code });
    if (!remote) return "notfound";
    setSyncCode(code);
    await pullAndMerge();
    return status.state === "error" ? "error" : "ok";
  } catch {
    return "error";
  }
}

export function disableSync() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  setSyncCode(null);
  setStatus({ state: "off" });
}

let started = false;
/** Call once at app start. */
export function startSync() {
  if (started) return;
  started = true;
  onProgressSaved(() => schedulePush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && target()) { if (dirty) void pushNow(); else void pullAndMerge(); }
  });
  window.addEventListener("online", () => { if (dirty) void pushNow(); });
  if (target()) void pullAndMerge();
}

// ------------------------------------------------------------------ email sign-in

/** Ask the server to email a one-time sign-in link. */
export async function requestSignIn(email: string): Promise<"ok" | "bademail" | "limited" | "error"> {
  try {
    const r = await fetch("/api/auth/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    if (r.ok) return "ok";
    if (r.status === 400) return "bademail";
    if (r.status === 429) return "limited";
    return "error";
  } catch { return "error"; }
}

/**
 * Finish signing in from a link. Order matters: any sync-code progress is pulled first (the code
 * stops being used once a session exists), then the session is created, then the account's own
 * progress is merged in and the result pushed. Local progress is never lost.
 */
export async function signInWithToken(token: string): Promise<"ok" | "invalid" | "error"> {
  if (getSyncCode() && !getAccountEmail()) {
    // the code stops being used once signed in, so its progress must be here first; the token is not spent yet
    await pullAndMerge();
    if (status.state === "error") return "error";
  }
  let email: string;
  try {
    const r = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }), credentials: "same-origin" });
    if (r.status === 400) return "invalid";
    if (!r.ok) return "error";
    email = (await r.json()).email as string;
  } catch { return "error"; }
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  setSyncCode(null);
  setAccountEmail(email);
  // signed in from here on, even if this first merge fails: the token is spent, and sync retries on the next save
  await pullAndMerge();
  return "ok";
}

/** End the session on this browser. Progress stays here and on the account. */
export async function signOut(): Promise<void> {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch { /* cookie may linger; the next 401 clears local state */ }
  signedOutLocally();
}

/** Delete the account record and its server-side progress. Local progress is left alone. */
export async function deleteAccount(): Promise<"ok" | "error"> {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  try {
    const r = await fetch("/api/account", { method: "DELETE", credentials: "same-origin" });
    if (!r.ok && r.status !== 401) return "error";
  } catch { return "error"; }
  signedOutLocally();
  return "ok";
}

export function useSyncStatus(): SyncStatus {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return status;
}
