// Cross-device sync of the learner's progress through /api/progress, keyed by a secret sync code
// kept in localStorage. Local storage stays the source of truth; the server copy is merged in.
import { useEffect, useState } from "react";
import { getProgress, onProgressSaved, replaceProgress, type ExerciseRecord, type Progress } from "./progress";

const CODE_KEY = "forallx-sync-code";
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

function ts(x: unknown): number { return typeof x === "number" && Number.isFinite(x) ? x : 0; }

/** Merge two copies of the progress. Newer wins per record; nothing older than the latest reset survives. */
export function mergeProgress(local: Progress, remote: Progress): Progress {
  const clearedAt = Math.max(ts(local.clearedAt), ts(remote.clearedAt));
  const keep = (t: number) => t >= clearedAt;

  const exercises: Record<string, ExerciseRecord> = {};
  for (const id of new Set([...Object.keys(local.exercises ?? {}), ...Object.keys(remote.exercises ?? {})])) {
    const a = local.exercises?.[id], b = remote.exercises?.[id];
    const pick = !a ? b : !b ? a : ts(b.updated) > ts(a.updated) ? b : a;
    if (pick && keep(ts(pick.updated))) exercises[id] = pick;
  }

  const maxMap = (x: Record<string, number> = {}, y: Record<string, number> = {}) => {
    const out: Record<string, number> = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      const v = Math.max(ts(x[k]), ts(y[k]));
      if (keep(v)) out[k] = v;
    }
    return out;
  };
  const read = maxMap(local.read, remote.read);
  const visited = maxMap(local.visited, remote.visited);

  const latest = (m: Record<string, number> = {}) => Math.max(0, ...Object.values(m).map(ts));
  const last = latest(remote.visited) > latest(local.visited) ? (remote.last ?? local.last) : (local.last ?? remote.last);

  const flash: Progress["flash"] = {};
  for (const k of new Set([...Object.keys(local.flash ?? {}), ...Object.keys(remote.flash ?? {})])) {
    const a = local.flash?.[k], b = remote.flash?.[k];
    flash[k] = (!a ? b : !b ? a : ts(b.due) > ts(a.due) ? b : a)!;
  }

  const notes: Record<string, string> = { ...(remote.notes ?? {}) };
  for (const [k, v] of Object.entries(local.notes ?? {})) if (v) notes[k] = v;
  const bookmarks = Array.from(new Set([...(remote.bookmarks ?? []), ...(local.bookmarks ?? [])]));

  return { ...local, exercises, read, visited, last, flash, notes, bookmarks, clearedAt: clearedAt || undefined, theme: local.theme };
}

// ------------------------------------------------------------------ transport

async function fetchRemote(code: string): Promise<{ data: Progress; updated: number } | null> {
  // the code travels in a header, not the URL, so it stays out of request logs
  const r = await fetch(ENDPOINT, { cache: "no-store", headers: { "x-sync-code": code } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`server ${r.status}`);
  return r.json();
}

async function pushRemote(code: string, data: Progress): Promise<number> {
  const r = await fetch(ENDPOINT, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, data }) });
  if (!r.ok) throw new Error(`server ${r.status}`);
  return (await r.json()).updated as number;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let dirty = false;

function schedulePush(delay = 1500) {
  const code = getSyncCode();
  if (!code) return;
  dirty = true;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void pushNow(); }, delay);
}

async function pushNow(): Promise<void> {
  const code = getSyncCode();
  if (!code || pushing) return;
  pushing = true;
  dirty = false;
  setStatus({ state: "syncing", at: status.at });
  try {
    const at = await pushRemote(code, getProgress());
    setStatus({ state: "synced", at });
  } catch (e) {
    dirty = true;
    setStatus({ state: "error", at: status.at, error: (e as Error).message });
  } finally {
    pushing = false;
    if (dirty) schedulePush(5000);
  }
}

/** Pull the server copy, merge it into local storage, and push the result if anything differed. */
export async function pullAndMerge(): Promise<void> {
  const code = getSyncCode();
  if (!code) return;
  setStatus({ state: "syncing", at: status.at });
  try {
    const remote = await fetchRemote(code);
    const local = getProgress();
    const merged = remote ? mergeProgress(local, remote.data) : local;
    const localJson = JSON.stringify(local);
    if (JSON.stringify(merged) !== localJson) replaceProgress(merged, { silent: true });
    if (!remote || JSON.stringify(remote.data) !== JSON.stringify(merged)) {
      const at = await pushRemote(code, merged);
      setStatus({ state: "synced", at });
    } else {
      setStatus({ state: "synced", at: remote.updated });
    }
  } catch (e) {
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
    const remote = await fetchRemote(code);
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
    if (document.visibilityState === "visible" && getSyncCode()) { if (dirty) void pushNow(); else void pullAndMerge(); }
  });
  window.addEventListener("online", () => { if (dirty) void pushNow(); });
  if (getSyncCode()) void pullAndMerge();
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
