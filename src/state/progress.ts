// Learner progress kept in localStorage (per browser). Nothing leaves the device.
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

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
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
export function resetProgress() { state = structuredClone(empty); save(); }
