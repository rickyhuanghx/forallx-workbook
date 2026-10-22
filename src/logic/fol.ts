// First-order semantics over finite interpretations, plus the equivalence tests used to check FOL
// symbolizations against the book's answer: an exact test for monadic sentences without identity
// (monadicEquivalent), and a sampling test for everything else (sampleEquivalent), which can only
// ever give evidence of equivalence, never proof.
import type { Formula, Term } from "./ast";
import { names, predicates, subformulas } from "./ast";

export interface Interpretation {
  domain: number[];
  names: Record<string, number>;
  /** predicate -> set of tuples encoded as "1,2" */
  preds: Record<string, Set<string>>;
}

export function isFOL(f: Formula): boolean {
  return subformulas(f).every((g) => g.kind !== "box" && g.kind !== "dia");
}

function termVal(t: Term, I: Interpretation, env: Record<string, number>): number {
  if (t.kind === "var") {
    if (!(t.name in env)) throw new Error(`Variable ${t.name} is free`);
    return env[t.name];
  }
  if (!(t.name in I.names)) throw new Error(`Name ${t.name} has no referent`);
  return I.names[t.name];
}

export function evalFOL(f: Formula, I: Interpretation, env: Record<string, number> = {}): boolean {
  switch (f.kind) {
    case "atom": {
      const ext = I.preds[f.pred];
      if (!ext) return false;
      let key = "";
      for (let i = 0; i < f.args.length; i++) key += (i ? "," : "") + termVal(f.args[i], I, env);
      return ext.has(key);
    }
    case "eq":
      return termVal(f.left, I, env) === termVal(f.right, I, env);
    case "bot":
      return false;
    case "not":
      return !evalFOL(f.sub, I, env);
    case "and":
      return evalFOL(f.left, I, env) && evalFOL(f.right, I, env);
    case "or":
      return evalFOL(f.left, I, env) || evalFOL(f.right, I, env);
    case "imp":
      return !evalFOL(f.left, I, env) || evalFOL(f.right, I, env);
    case "iff":
      return evalFOL(f.left, I, env) === evalFOL(f.right, I, env);
    case "forall":
    case "exists": {
      // bind the variable in place and restore it afterwards (copying env per object was the hot spot)
      const had = Object.prototype.hasOwnProperty.call(env, f.v);
      const old = env[f.v];
      let result = f.kind === "forall";
      for (const d of I.domain) {
        env[f.v] = d;
        if (evalFOL(f.sub, I, env) !== (f.kind === "forall")) { result = !result; break; }
      }
      if (had) env[f.v] = old; else delete env[f.v];
      return result;
    }
    default:
      throw new Error("Modal operators have no FOL semantics");
  }
}

function tuples(n: number, k: number): string[] {
  if (k === 0) return [""];
  const out: string[] = [];
  const rec = (acc: number[]) => {
    if (acc.length === k) { out.push(acc.join(",")); return; }
    for (let i = 1; i <= n; i++) rec([...acc, i]);
  };
  rec([]);
  return out;
}

/** A pseudo-random interpretation over a domain of the given size for the given signature. */
export function randomInterpretation(size: number, sig: Map<string, number>, nameSet: Set<string>, rnd: () => number): Interpretation {
  const domain = Array.from({ length: size }, (_, i) => i + 1);
  const I: Interpretation = { domain, names: {}, preds: {} };
  for (const n of nameSet) I.names[n] = 1 + Math.floor(rnd() * size);
  for (const [p, k] of sig) {
    const s = new Set<string>();
    const bias = rnd(); // vary density so that sparse and dense extensions both occur
    for (const t of tuples(size, k)) if (rnd() < bias) s.add(t);
    I.preds[p] = s;
  }
  return I;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SampleResult {
  equivalent: boolean;
  counter?: Interpretation;
  samples: number;
}

/** Deepest nesting of quantifiers. */
export function quantifierDepth(f: Formula): number {
  switch (f.kind) {
    case "forall": case "exists": return 1 + quantifierDepth(f.sub);
    case "not": case "box": case "dia": return quantifierDepth(f.sub);
    case "and": case "or": case "imp": case "iff": return Math.max(quantifierDepth(f.left), quantifierDepth(f.right));
    default: return 0;
  }
}

/**
 * Domain sizes to sample, with how many interpretations of each size. Sentences of quantifier depth q
 * with n names can need about q + n + 1 objects to tell apart ("at least four" vs "exactly four" needs
 * five), so the largest size grows with the sentences, up to 7.
 */
function samplePlan(fs: Formula[], samples: number): [number, number][] {
  const q = Math.max(0, ...fs.map(quantifierDepth));
  const n = new Set(fs.flatMap((f) => [...names(f)])).size;
  const max = Math.min(7, Math.max(4, q + n + 1));
  const plan: [number, number][] = [[1, 40], [2, 300], [3, 600], [4, samples]];
  for (let size = 5; size <= max; size++) plan.push([size, size >= 7 ? 150 : 300]);
  return plan;
}

/**
 * Test whether two FOL sentences agree on every sampled finite interpretation.
 * A found disagreement is a genuine counterexample; agreement on all samples is
 * evidence of equivalence, not proof (use monadicEquivalent where it applies).
 */
export function sampleEquivalent(a: Formula, b: Formula, samples = 1500): SampleResult {
  const sig = new Map<string, number>([...predicates(a), ...predicates(b)]);
  const ns = new Set<string>([...names(a), ...names(b)]);
  const rnd = mulberry(12345);
  let count = 0;
  for (const [size, per] of samplePlan([a, b], samples)) {
    for (let i = 0; i < per; i++) {
      const I = randomInterpretation(size, sig, ns, rnd);
      count++;
      if (evalFOL(a, I) !== evalFOL(b, I)) return { equivalent: false, counter: I, samples: count };
    }
  }
  return { equivalent: true, samples: count };
}

/** Does the argument have a sampled counterexample? */
export function sampleCounterexample(premises: Formula[], conclusion: Formula, samples = 1500): Interpretation | null {
  const all = [...premises, conclusion];
  const sig = new Map<string, number>();
  const ns = new Set<string>();
  for (const f of all) { for (const [p, k] of predicates(f)) sig.set(p, k); for (const n of names(f)) ns.add(n); }
  const rnd = mulberry(777);
  for (const [size, per] of samplePlan(all, samples)) {
    for (let i = 0; i < per; i++) {
      const I = randomInterpretation(size, sig, ns, rnd);
      if (premises.every((p) => evalFOL(p, I)) && !evalFOL(conclusion, I)) return I;
    }
  }
  return null;
}

/**
 * Exact equivalence for monadic sentences without identity (every predicate takes at most one
 * argument, and no =). Objects that satisfy the same predicates cannot be told apart by such
 * sentences, so any interpretation agrees with the one whose objects are its distinct "types"
 * (sets of predicates). Checking every non-empty set of types, with every placement of the names
 * and every value of the sentence letters, therefore decides equivalence.
 * Returns null when the sentences are outside this fragment or the check would be too large.
 */
export function monadicEquivalent(a: Formula, b: Formula, budget = 3_000_000): SampleResult | null {
  const subs = [...subformulas(a), ...subformulas(b)];
  if (subs.some((g) => g.kind === "eq" || g.kind === "box" || g.kind === "dia")) return null;
  const arity = new Map<string, number>();
  for (const g of subs) {
    if (g.kind !== "atom") continue;
    const k = arity.get(g.pred);
    if (k !== undefined && k !== g.args.length) return null;   // one letter used with two arities
    if (g.args.length > 1) return null;
    arity.set(g.pred, g.args.length);
  }
  const unary = [...arity].filter(([, k]) => k === 1).map(([p]) => p);
  const letters = [...arity].filter(([, k]) => k === 0).map(([p]) => p);
  const ns = [...new Set([...names(a), ...names(b)])];
  const T = 1 << unary.length;                                 // number of types
  if (unary.length > 4) return null;
  const q = Math.max(quantifierDepth(a), quantifierDepth(b));
  // estimated work: sum over domain sizes m of C(T, m) * m^names * 2^letters * m^q
  let cost = 0, binom = 1;
  for (let m = 1; m <= T; m++) {
    binom = (binom * (T - m + 1)) / m;
    cost += binom * m ** ns.length * 2 ** letters.length * Math.max(1, m ** q);
  }
  if (cost > budget) return null;
  let count = 0;
  for (let set = 1; set < 1 << T; set++) {
    const types: number[] = [];
    for (let t = 0; t < T; t++) if (set & (1 << t)) types.push(t);
    const m = types.length;
    const domain = types.map((_, i) => i + 1);
    const preds: Record<string, Set<string>> = {};
    unary.forEach((p, j) => { preds[p] = new Set(types.flatMap((t, i) => (t & (1 << j) ? [String(i + 1)] : []))); });
    const placements = m ** ns.length;
    for (let pl = 0; pl < placements; pl++) {
      const nm: Record<string, number> = {};
      let x = pl;
      for (const c of ns) { nm[c] = (x % m) + 1; x = Math.floor(x / m); }
      for (let lv = 0; lv < 1 << letters.length; lv++) {
        const I: Interpretation = { domain, names: nm, preds: { ...preds } };
        letters.forEach((l, j) => { I.preds[l] = lv & (1 << j) ? new Set([""]) : new Set(); });
        count++;
        if (evalFOL(a, I) !== evalFOL(b, I)) return { equivalent: false, counter: I, samples: count };
      }
    }
  }
  return { equivalent: true, samples: count };
}

export function describeInterpretation(I: Interpretation): string {
  const parts = [`domain: {${I.domain.join(", ")}}`];
  for (const [n, v] of Object.entries(I.names)) parts.push(`${n}: ${v}`);
  for (const [p, s] of Object.entries(I.preds)) {
    const items = [...s].map((t) => (t.includes(",") ? `⟨${t.replace(/,/g, ", ")}⟩` : t));
    parts.push(`${p}: {${items.join(", ")}}`);
  }
  return parts.join("; ");
}
