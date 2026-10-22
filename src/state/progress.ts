// Learner progress kept in localStorage (per browser). With a sync code or account (see sync.ts) a copy is
// also kept on the server and merged across devices. Other tabs of the same browser are merged in through
// the storage event, so two open tabs never overwrite each other's work.
import { useCallback, useEffect, useState } from "react";

export interface ExerciseRecord {
  status: "done" | "correct" | "revealed" | "attempted";
  answer?: string;        // last answer text (symbolization, free response)
  proof?: unknown;        // saved proof editor state
  table?: unknown;        // saved truth-table state
  updated: number;
}

export interface Progress {
  read: Record<string, number>;          // chapter id -> timestamp finished reading
  unread?: Record<string, number>;       // chapter id -> timestamp the read mark was removed (so sync does not bring it back)
  visited: Record<string, number>;       // chapter id -> last visit
  last?: { chapter: string; anchor?: string };
  exercises: Record<string, ExerciseRecord>;
  notes: Record<string, string>;         // chapter id -> free notes
  bookmarks: string[];
  flash: Record<string, { box: number; due: number }>;   // glossary key -> spaced repetition
  theme?: "light" | "dark" | "auto";
  clearedAt?: number;                    // last "reset progress"; older records never come back from sync
}

const KEY = "forallx-progress-v1";
const LAB_KEEP = 100;                    // Lab entries kept, newest first, so the synced copy cannot grow without bound
const empty: Progress = { read: {}, visited: {}, exercises: {}, notes: {}, bookmarks: [], flash: {} };

// ------------------------------------------------------------------ clock

let clockOffset = 0;
/** Milliseconds since the epoch on the server's clock when sync has measured a real skew, else this device's. */
export const now = () => Date.now() + clockOffset;
/** Sync reports the server-minus-device difference; only a real skew is applied, never request jitter. */
export function setClockOffset(ms: number) { clockOffset = Math.abs(ms) > 30_000 ? ms : 0; }

// ------------------------------------------------------------------ shape

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
function numMap(x: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(x)) for (const [k, v] of Object.entries(x)) if (num(v)) out[k] = v as number;
  return out;
}
const STATUSES = new Set(["done", "correct", "revealed", "attempted"]);

/** Coerce anything (localStorage, an imported file, the server copy) into a well-formed Progress, dropping what does not fit. */
export function sanitize(raw: unknown): Progress {
  const r = isObj(raw) ? raw : {};
  const exercises: Record<string, ExerciseRecord> = {};
  if (isObj(r.exercises)) {
    for (const [k, v] of Object.entries(r.exercises)) {
      if (isObj(v) && typeof v.status === "string" && STATUSES.has(v.status)) {
        exercises[k] = { ...(v as object), status: v.status as ExerciseRecord["status"], updated: num(v.updated) ? (v.updated as number) : 0 } as ExerciseRecord;
      }
    }
  }
  const notes: Record<string, string> = {};
  if (isObj(r.notes)) for (const [k, v] of Object.entries(r.notes)) if (typeof v === "string") notes[k] = v;
  const flash: Progress["flash"] = {};
  if (isObj(r.flash)) for (const [k, v] of Object.entries(r.flash)) if (isObj(v) && num(v.box) && num(v.due)) flash[k] = { box: v.box as number, due: v.due as number };
  const out: Progress = {
    read: numMap(r.read),
    visited: numMap(r.visited),
    exercises,
    notes,
    bookmarks: Array.isArray(r.bookmarks) ? r.bookmarks.filter((b): b is string => typeof b === "string") : [],
    flash,
  };
  const unread = numMap(r.unread);
  if (Object.keys(unread).length) out.unread = unread;
  if (isObj(r.last) && typeof r.last.chapter === "string") out.last = { chapter: r.last.chapter, ...(typeof r.last.anchor === "string" ? { anchor: r.last.anchor } : {}) };
  if (r.theme === "light" || r.theme === "dark" || r.theme === "auto") out.theme = r.theme;
  if (num(r.clearedAt)) out.clearedAt = r.clearedAt as number;
  return out;
}

// ------------------------------------------------------------------ merge (pure)

const ts = (x: unknown): number => (num(x) ? (x as number) : 0);
const complete = (s?: string) => s === "correct" || s === "done";

/** Keep only the newest LAB_KEEP Lab records. */
function pruneLab(ex: Record<string, ExerciseRecord>): Record<string, ExerciseRecord> {
  const lab = Object.keys(ex).filter((k) => k.startsWith("lab."));
  if (lab.length <= LAB_KEEP) return ex;
  const drop = new Set(lab.sort((a, b) => ts(ex[b].updated) - ts(ex[a].updated)).slice(LAB_KEEP));
  return Object.fromEntries(Object.entries(ex).filter(([k]) => !drop.has(k)));
}

/**
 * Merge two copies of the progress (two devices, or two tabs). Newer wins per record, with the same rule as
 * recordExercise: a later "attempted" or "revealed" never takes away an earlier "correct". Nothing older than
 * the latest reset survives. Removed read marks stay removed. Notes, bookmarks, glossary cards and the
 * Continue pointer carry no timestamps, so after a reset only the copy that has seen the reset supplies them.
 */
export function mergeProgress(localIn: Progress, remoteIn: Progress): Progress {
  const local = sanitize(localIn), remote = sanitize(remoteIn);
  const lc = ts(local.clearedAt), rc = ts(remote.clearedAt);
  const clearedAt = Math.max(lc, rc);
  const keep = (t: number) => t >= clearedAt;

  const exercises: Record<string, ExerciseRecord> = {};
  for (const id of new Set([...Object.keys(local.exercises), ...Object.keys(remote.exercises)])) {
    const a = local.exercises[id], b = remote.exercises[id];
    let pick = !a ? b : !b ? a : ts(b.updated) > ts(a.updated) ? b : a;
    const other = pick === a ? b : a;
    if (pick && other && other.status === "correct" && (pick.status === "attempted" || pick.status === "revealed") && keep(ts(other.updated))) {
      pick = { ...pick, status: "correct" };
    }
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
  const unread = maxMap(local.unread, remote.unread);
  for (const k of Object.keys(unread)) {
    if (read[k] !== undefined && read[k] > unread[k]) delete unread[k];
    else delete read[k];
  }
  const visited = maxMap(local.visited, remote.visited);

  // untimed collections: after a reset, take them from the side that has the newer reset
  const resetSide = lc > rc ? local : rc > lc ? remote : null;
  let flash: Progress["flash"], notes: Progress["notes"], bookmarks: string[], last: Progress["last"];
  if (resetSide) {
    ({ flash, notes, bookmarks, last } = resetSide);
  } else {
    flash = {};
    for (const k of new Set([...Object.keys(local.flash), ...Object.keys(remote.flash)])) {
      const a = local.flash[k], b = remote.flash[k];
      flash[k] = (!a ? b : !b ? a : ts(b.due) > ts(a.due) ? b : a)!;
    }
    notes = { ...remote.notes };
    for (const [k, v] of Object.entries(local.notes)) if (v) notes[k] = v;
    bookmarks = Array.from(new Set([...remote.bookmarks, ...local.bookmarks]));
    const latest = (m: Record<string, number>) => Math.max(0, ...Object.values(m).map(ts));
    last = latest(remote.visited) > latest(local.visited) ? (remote.last ?? local.last) : (local.last ?? remote.last);
  }

  const out: Progress = { ...local, exercises: pruneLab(exercises), read, visited, last, flash, notes, bookmarks, theme: local.theme };
  if (Object.keys(unread).length) out.unread = unread; else delete out.unread;
  if (clearedAt) out.clearedAt = clearedAt; else delete out.clearedAt;
  if (!last) delete out.last;
  return out;
}

// ------------------------------------------------------------------ store

function readDisk(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function parse(raw: string | null): Progress {
  if (!raw) return structuredClone(empty);
  try { return sanitize(JSON.parse(raw)); } catch { return structuredClone(empty); }
}

let lastWritten = readDisk();
let state: Progress = parse(lastWritten);
const listeners = new Set<() => void>();
const external: Record<string, number> = {};

/**
 * How many times exercise `id` was changed from outside this tab (another device or tab, an import or a reset).
 * Exercise widgets read their saved record once, so they are keyed on this to show the new record.
 */
export function externalRevision(id: string): number {
  let n = 0;
  for (const [k, v] of Object.entries(external)) if (k === id || k.startsWith(id + ".")) n += v;   // id.1, id.2: an item's several proofs
  return n;
}

function noteExternal(before: Progress, after: Progress) {
  for (const id of new Set([...Object.keys(before.exercises), ...Object.keys(after.exercises)])) {
    if (JSON.stringify(before.exercises[id]) !== JSON.stringify(after.exercises[id])) external[id] = (external[id] ?? 0) + 1;
  }
}

let savedHook: (() => void) | null = null;
/** Called after every local save that should reach the server (sync.ts registers itself here). */
export function onProgressSaved(cb: () => void) { savedHook = cb; }

function save(silent = false) {
  // another tab may have written since we last did; fold its copy in before overwriting it
  const disk = readDisk();
  if (disk !== lastWritten && disk) {
    const merged = mergeProgress(state, parse(disk));
    noteExternal(state, merged);
    state = merged;
  }
  const raw = JSON.stringify(state);
  try { localStorage.setItem(KEY, raw); lastWritten = raw; } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
  if (!silent) savedHook?.();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    if (e.newValue === null) return;   // cleared elsewhere: keep this tab's copy, it is written back on the next save
    const merged = mergeProgress(state, parse(e.newValue));
    noteExternal(state, merged);
    state = merged;
    const raw = JSON.stringify(state);
    lastWritten = e.newValue;
    if (raw !== e.newValue) { try { localStorage.setItem(KEY, raw); lastWritten = raw; } catch { /* ignore */ } }
    listeners.forEach((l) => l());
  });
}

/** Replace the whole state (used by sync after a merge). silent: do not push back to the server. */
export function replaceProgress(p: Progress, opts: { silent?: boolean } = {}) {
  const next = sanitize(p);
  noteExternal(state, next);
  state = next;
  save(!!opts.silent);
}

export function getProgress(): Progress { return state; }

export function update(fn: (p: Progress) => void) {
  const next = structuredClone(state);
  fn(next);
  next.exercises = pruneLab(next.exercises);
  state = next;
  save();
}

export function useProgress(): [Progress, (fn: (p: Progress) => void) => void] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const up = useCallback((fn: (p: Progress) => void) => update(fn), []);
  return [state, up];
}

export function recordExercise(id: string, rec: Partial<ExerciseRecord> & { status: ExerciseRecord["status"] }) {
  update((p) => {
    const prev = p.exercises[id];
    // never downgrade "correct" to "attempted"
    const status = prev?.status === "correct" && rec.status === "attempted" ? "correct" : rec.status;
    p.exercises[id] = { ...prev, ...rec, status, updated: now() };
  });
}

/** Mark a chapter read or unread. Unread leaves a dated marker so another device's older read mark does not return. */
export function setRead(chapterId: string, isRead: boolean) {
  update((p) => {
    const t = now();
    p.unread = p.unread ?? {};
    if (isRead) { p.read[chapterId] = t; delete p.unread[chapterId]; }
    else { delete p.read[chapterId]; p.unread[chapterId] = t; }
    if (!Object.keys(p.unread).length) delete p.unread;
  });
}

export function exportProgress(): string { return JSON.stringify(state, null, 2); }

/**
 * Restore a backup file. Everything in it is stamped as of now, so a reset made before the import (here or on
 * another device) does not remove it again at the next sync. Throws if the file is not a progress backup.
 */
export function importProgress(json: string) {
  const parsed: unknown = JSON.parse(json);
  if (!isObj(parsed) || !isObj(parsed.exercises)) throw new Error("not a progress file");
  const p = sanitize(parsed);
  const t = now();
  for (const r of Object.values(p.exercises)) r.updated = t;
  for (const k of Object.keys(p.read)) p.read[k] = t;
  for (const k of Object.keys(p.visited)) p.visited[k] = t;
  delete p.unread;
  if (state.clearedAt) p.clearedAt = state.clearedAt; else delete p.clearedAt;
  noteExternal(state, p);
  state = p;
  save();
}

export function resetProgress() {
  const next: Progress = { ...structuredClone(empty), clearedAt: now() };
  noteExternal(state, next);
  state = next;
  save();
}

/** True when an exercise record counts as finished (checked correct, or marked done by the learner). */
export function isComplete(status?: ExerciseRecord["status"]): boolean { return complete(status); }

/**
 * Completed exercise items, counted at item depth only (chNN.A.3, or chNN..3 for a chapter whose exercises have
 * no part letter), so whole-part answers, sub-proofs and the Lab never inflate the count.
 */
export function completedItems(p: Progress, chapterId?: string): number {
  const re = chapterId ? new RegExp(`^${chapterId}\\.[A-Z]*\\.\\d+$`) : /^[a-z]+\d*\.[A-Z]*\.\d+$/;
  return Object.entries(p.exercises).filter(([k, v]) => re.test(k) && isComplete(v.status)).length;
}
