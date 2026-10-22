// Progress store and merge: two tabs, removals, resets, imports, malformed data, counting, clock skew.
// Runs in Node with an in-memory localStorage standing in for the browser's.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
const P = await import("../src/state/progress");
const { mergeProgress, sanitize, completedItems } = P;
type Progress = import("../src/state/progress").Progress;

const checks: [string, boolean][] = [];
const base = (): Progress => ({ read: {}, visited: {}, exercises: {}, notes: {}, bookmarks: [], flash: {} });
const KEY = "forallx-progress-v1";

// merge rules
{
  const a = base(); a.exercises["ch05.A.1"] = { status: "correct", updated: 100 };
  const b = base(); b.exercises["ch05.A.1"] = { status: "attempted", answer: "x", updated: 200 };
  const m = mergeProgress(a, b);
  checks.push(["older correct survives a newer attempted from another device", m.exercises["ch05.A.1"].status === "correct" && m.exercises["ch05.A.1"].answer === "x"]);
  const c = base(); c.exercises["ch05.A.1"] = { status: "attempted", updated: 300 };
  const d = base(); d.exercises["ch05.A.1"] = { status: "done", updated: 200 };
  checks.push(["unticking done still wins when newer", mergeProgress(c, d).exercises["ch05.A.1"].status === "attempted"]);

  const r1 = base(); r1.read = { ch05: 100 };
  const r2 = base(); r2.unread = { ch05: 200 };
  const m2 = mergeProgress(r1, r2);
  checks.push(["removed read mark stays removed", !m2.read.ch05 && m2.unread?.ch05 === 200]);
  const r3 = base(); r3.read = { ch05: 300 };
  const m3 = mergeProgress(r2, r3);
  checks.push(["re-marking read after removal wins", m3.read.ch05 === 300 && !m3.unread?.ch05]);

  const old = base(); old.flash = { k: { box: 3, due: 9e12 } }; old.notes = { ch01: "n" }; old.bookmarks = ["ch02"]; old.last = { chapter: "ch09" }; old.visited = { ch09: 50 };
  const reset = { ...base(), clearedAt: 100 };
  const m4 = mergeProgress(reset, old);
  checks.push(["reset clears cards, notes, bookmarks and Continue on merge", !Object.keys(m4.flash).length && !Object.keys(m4.notes).length && !m4.bookmarks.length && !m4.last && !m4.visited.ch09]);
  const m5 = mergeProgress(old, reset);
  checks.push(["reset wins from either side", !Object.keys(m5.flash).length && m5.clearedAt === 100]);
  const same1 = base(); same1.flash = { k: { box: 1, due: 10 } };
  const same2 = base(); same2.flash = { k: { box: 2, due: 20 } }; same2.bookmarks = ["ch03"];
  const m6 = mergeProgress(same1, same2);
  checks.push(["without a reset, cards and bookmarks still merge", m6.flash.k.box === 2 && m6.bookmarks.includes("ch03")]);
  checks.push(["merge is idempotent", JSON.stringify(mergeProgress(m6, m6)) === JSON.stringify(m6)]);

  const lab = base();
  for (let i = 0; i < 150; i++) lab.exercises[`lab.${i}`] = { status: "attempted", updated: i };
  const pruned = mergeProgress(lab, base());
  const labKeys = Object.keys(pruned.exercises);
  checks.push(["Lab history capped at the newest 100", labKeys.length === 100 && !!pruned.exercises["lab.149"] && !pruned.exercises["lab.0"]]);
}

// malformed data never throws downstream
{
  const bad = sanitize({ exercises: null, read: "x", flash: [1], bookmarks: [1, "ch01"], notes: { a: 3, b: "ok" }, last: 5 });
  let ok = true;
  try { completedItems(bad); mergeProgress(bad, sanitize(null)); } catch { ok = false; }
  checks.push(["malformed progress is coerced, not fatal", ok && Object.keys(bad.exercises).length === 0 && bad.bookmarks.length === 1 && bad.notes.b === "ok" && !bad.last]);
  let threw = false;
  try { P.importProgress('{"exercises": null}'); } catch { threw = true; }
  checks.push(["import refuses a file that is not a backup", threw]);
}

// counting
{
  const p = base();
  for (const id of ["ch01..1", "ch01..2", "ch05.A.1", "ch05.A", "ch05.A.1.1", "lab.x"]) p.exercises[id] = { status: "correct", updated: 1 };
  checks.push(["chapter 1 (no part letter) counts", completedItems(p, "ch01") === 2]);
  checks.push(["whole-part, sub-proof and Lab ids still do not count", completedItems(p) === 3]);
}

// two tabs: this tab saves after another tab wrote; nothing is lost
{
  P.recordExercise("ch05.A.1", { status: "correct" });
  const other = JSON.parse(store.get(KEY)!);
  other.exercises["ch05.A.2"] = { status: "correct", updated: Date.now() };
  store.set(KEY, JSON.stringify(other));          // the other tab's write (its storage event has not arrived)
  P.recordExercise("ch05.A.3", { status: "correct" });
  const disk = JSON.parse(store.get(KEY)!);
  checks.push(["second tab's work survives this tab's save", !!disk.exercises["ch05.A.1"] && !!disk.exercises["ch05.A.2"] && !!disk.exercises["ch05.A.3"]]);
  checks.push(["widget revision bumped for the record that arrived", P.externalRevision("ch05.A.2") > 0 && P.externalRevision("ch05.A.3") === 0]);
}

// import after a reset is not undone by the reset
{
  const backup = P.exportProgress();
  P.resetProgress();
  const clearedAt = P.getProgress().clearedAt!;
  P.importProgress(backup);
  const remoteWithReset = { ...base(), clearedAt };
  const merged = mergeProgress(P.getProgress(), remoteWithReset);
  checks.push(["restored backup survives the earlier reset", !!merged.exercises["ch05.A.1"] && !!merged.exercises["ch05.A.3"]]);
}

// clock skew
{
  P.setClockOffset(2000);
  const t1 = P.now() - Date.now();
  P.setClockOffset(3_600_000);
  const t2 = P.now() - Date.now();
  P.setClockOffset(0);
  checks.push(["request jitter ignored, real skew applied", Math.abs(t1) < 50 && Math.abs(t2 - 3_600_000) < 50]);
}

let fail = 0;
for (const [name, ok] of checks) { if (!ok) { fail++; console.log("FAIL state:", name); } }
console.log(`state: pass ${checks.length - fail}, fail ${fail}`);
if (fail) process.exit(1);
