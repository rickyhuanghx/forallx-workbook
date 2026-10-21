// Truth-functional semantics: valuations, truth tables, semantic concepts.
import type { Formula } from "./ast";
import { letters, subformulas } from "./ast";

export type Valuation = Record<string, boolean>;

export function evalTFL(f: Formula, v: Valuation): boolean {
  switch (f.kind) {
    case "atom":
      if (f.args.length) throw new Error("Not a TFL sentence");
      return !!v[f.pred];
    case "bot":
      return false;
    case "not":
      return !evalTFL(f.sub, v);
    case "and":
      return evalTFL(f.left, v) && evalTFL(f.right, v);
    case "or":
      return evalTFL(f.left, v) || evalTFL(f.right, v);
    case "imp":
      return !evalTFL(f.left, v) || evalTFL(f.right, v);
    case "iff":
      return evalTFL(f.left, v) === evalTFL(f.right, v);
    default:
      throw new Error("Not a TFL sentence");
  }
}

export function isTFL(f: Formula): boolean {
  return subformulas(f).every((g) => (g.kind === "atom" && g.args.length === 0) || ["bot", "not", "and", "or", "imp", "iff"].includes(g.kind));
}

/** All valuations over the given letters, in the book's order (first letter changes slowest). */
export function valuations(ls: string[]): Valuation[] {
  const n = ls.length;
  const out: Valuation[] = [];
  for (let r = 0; r < 1 << n; r++) {
    const v: Valuation = {};
    for (let i = 0; i < n; i++) v[ls[i]] = ((r >> (n - 1 - i)) & 1) === 0;
    out.push(v);
  }
  return out;
}

export function allLetters(fs: Formula[]): string[] {
  const s = new Set<string>();
  for (const f of fs) for (const l of letters(f)) s.add(l);
  return [...s].sort((a, b) => {
    const pa = a.match(/^([A-Z])(\d*)$/)!;
    const pb = b.match(/^([A-Z])(\d*)$/)!;
    if (pa[1] !== pb[1]) return pa[1] < pb[1] ? -1 : 1;
    return (parseInt(pa[2] || "0") || 0) - (parseInt(pb[2] || "0") || 0);
  });
}

export interface TruthTable {
  letters: string[];
  rows: { valuation: Valuation; values: boolean[] }[]; // values indexed by subformula order
  subs: Formula[];
}

export function truthTable(f: Formula, ls: string[] = letters(f)): TruthTable {
  const subs = subformulas(f);
  const rows = valuations(ls).map((valuation) => ({ valuation, values: subs.map((g) => evalTFL(g, valuation)) }));
  return { letters: ls, rows, subs };
}

export function isTautology(f: Formula): boolean {
  return valuations(letters(f)).every((v) => evalTFL(f, v));
}
export function isContradiction(f: Formula): boolean {
  return valuations(letters(f)).every((v) => !evalTFL(f, v));
}
export function equivalent(a: Formula, b: Formula): boolean {
  return valuations(allLetters([a, b])).every((v) => evalTFL(a, v) === evalTFL(b, v));
}
export function jointlySatisfiable(fs: Formula[]): Valuation | null {
  for (const v of valuations(allLetters(fs))) if (fs.every((f) => evalTFL(f, v))) return v;
  return null;
}
/** Returns a counterexample valuation, or null when the argument is valid. */
export function counterexample(premises: Formula[], conclusion: Formula): Valuation | null {
  for (const v of valuations(allLetters([...premises, conclusion]))) {
    if (premises.every((p) => evalTFL(p, v)) && !evalTFL(conclusion, v)) return v;
  }
  return null;
}
