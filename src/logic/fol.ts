// First-order semantics over finite interpretations, plus a sampling-based
// equivalence test used to check FOL symbolizations against the book's answer.
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
      const ext = I.preds[f.pred] ?? new Set();
      return ext.has(f.args.map((t) => termVal(t, I, env)).join(","));
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
      return I.domain.every((d) => evalFOL(f.sub, I, { ...env, [f.v]: d }));
    case "exists":
      return I.domain.some((d) => evalFOL(f.sub, I, { ...env, [f.v]: d }));
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

/**
 * Test whether two FOL sentences agree on every sampled finite interpretation.
 * A found disagreement is a genuine counterexample; agreement on all samples is
 * strong (not conclusive) evidence of equivalence.
 */
export function sampleEquivalent(a: Formula, b: Formula, samples = 1500): SampleResult {
  const sig = new Map<string, number>([...predicates(a), ...predicates(b)]);
  const ns = new Set<string>([...names(a), ...names(b)]);
  const rnd = mulberry(12345);
  let count = 0;
  // exhaustive on domain size 1 and 2 when the signature is small
  for (let size = 1; size <= 4; size++) {
    const per = size === 1 ? 40 : size === 2 ? 300 : size === 3 ? 600 : samples;
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
  for (let size = 1; size <= 4; size++) {
    const per = size === 1 ? 40 : size === 2 ? 300 : size === 3 ? 600 : samples;
    for (let i = 0; i < per; i++) {
      const I = randomInterpretation(size, sig, ns, rnd);
      if (premises.every((p) => evalFOL(p, I)) && !evalFOL(conclusion, I)) return I;
    }
  }
  return null;
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
