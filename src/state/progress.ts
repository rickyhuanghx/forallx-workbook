// Learner progress kept in localStorage (per browser). With a sync code (see sync.ts) a copy is
// also kept on the server and merged across devices.
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
const empty: Progress = { read: {}, visited: {}, exercises: {}, notes: {}, bookmarks: [], flash: {} };

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(empty);
    return { ...structuredClone(empty), ...JSON.parse(raw) };
  } catch {
    return structuredClone(empty);
  }
}

let state: Progress = load();
const listeners = new Set<() => void>();

let savedHook: (() => void) | null = null;
/** Called after every local save that should reach the server (sync.ts registers itself here). */
export function onProgressSaved(cb: () => void) { savedHook = cb; }

function save(silent = false) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
  if (!silent) savedHook?.();
}

/** Replace the whole state (used by sync after a merge). silent: do not push back to the server. */
export function replaceProgress(p: Progress, opts: { silent?: boolean } = {}) {
  state = { ...structuredClone(empty), ...p };
  save(!!opts.silent);
}

export function getProgress(): Progress { return state; }

export function update(fn: (p: Progress) => void) {
  const next = structuredClone(state);
  fn(next);
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
    p.exercises[id] = { ...prev, ...rec, status, updated: Date.now() };
  });
}

export function exportProgress(): string { return JSON.stringify(state, null, 2); }
export function importProgress(json: string) {
  const parsed = JSON.parse(json);
  state = { ...structuredClone(empty), ...parsed };
  save();
}
export function resetProgress() { state = { ...structuredClone(empty), clearedAt: Date.now() }; save(); }

/** True when an exercise record counts as finished (checked correct, or marked done by the learner). */
export function isComplete(status?: ExerciseRecord["status"]): boolean { return status === "correct" || status === "done"; }

/** Completed exercise items, counted at item depth only (chNN.A.3), so whole-part answers, sub-proofs and the Lab never inflate the count. */
export function completedItems(p: Progress, chapterId?: string): number {
  const re = chapterId ? new RegExp(`^${chapterId}\\.[A-Z]+\\.\\d+$`) : /^[a-z]+\d*\.[A-Z]+\.\d+$/;
  return Object.entries(p.exercises).filter(([k, v]) => re.test(k) && isComplete(v.status)).length;
}
