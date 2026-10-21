// Formula syntax shared by TFL, FOL and ML (forall x: Calgary conventions).

export type Term = { kind: "name"; name: string } | { kind: "var"; name: string };

export type Formula =
  | { kind: "atom"; pred: string; args: Term[] }
  | { kind: "eq"; left: Term; right: Term }
  | { kind: "bot" }
  | { kind: "not"; sub: Formula }
  | { kind: "and" | "or" | "imp" | "iff"; left: Formula; right: Formula }
  | { kind: "forall" | "exists"; v: string; sub: Formula }
  | { kind: "box" | "dia"; sub: Formula };

export type BinKind = "and" | "or" | "imp" | "iff";

export const isBinary = (f: Formula): f is Extract<Formula, { kind: BinKind }> =>
  f.kind === "and" || f.kind === "or" || f.kind === "imp" || f.kind === "iff";

export function termEq(a: Term, b: Term): boolean {
  return a.kind === b.kind && a.name === b.name;
}

export function eq(a: Formula, b: Formula): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "atom": {
      const bb = b as typeof a;
      return a.pred === bb.pred && a.args.length === bb.args.length && a.args.every((t, i) => termEq(t, bb.args[i]));
    }
    case "eq": {
      const bb = b as typeof a;
      return termEq(a.left, bb.left) && termEq(a.right, bb.right);
    }
    case "bot":
      return true;
    case "not":
    case "box":
    case "dia":
      return eq(a.sub, (b as typeof a).sub);
    case "forall":
    case "exists": {
      const bb = b as typeof a;
      return a.v === bb.v && eq(a.sub, bb.sub);
    }
    default: {
      const bb = b as typeof a;
      return eq(a.left, bb.left) && eq(a.right, bb.right);
    }
  }
}

/** Alpha-equivalence: equal up to renaming of bound variables. */
export function alphaEq(a: Formula, b: Formula, env: Map<string, string> = new Map()): boolean {
  if (a.kind !== b.kind) return false;
  const tEq = (x: Term, y: Term) => {
    if (x.kind !== y.kind) return false;
    if (x.kind === "var") return (env.get(x.name) ?? x.name) === y.name;
    return x.name === y.name;
  };
  switch (a.kind) {
    case "atom": {
      const bb = b as typeof a;
      return a.pred === bb.pred && a.args.length === bb.args.length && a.args.every((t, i) => tEq(t, bb.args[i]));
    }
    case "eq": {
      const bb = b as typeof a;
      return tEq(a.left, bb.left) && tEq(a.right, bb.right);
    }
    case "bot":
      return true;
    case "not":
    case "box":
    case "dia":
      return alphaEq(a.sub, (b as typeof a).sub, env);
    case "forall":
    case "exists": {
      const bb = b as typeof a;
      const env2 = new Map(env);
      env2.set(a.v, bb.v);
      return alphaEq(a.sub, bb.sub, env2);
    }
    default: {
      const bb = b as typeof a;
      return alphaEq(a.left, bb.left, env) && alphaEq(a.right, bb.right, env);
    }
  }
}

export function subformulas(f: Formula, acc: Formula[] = []): Formula[] {
  acc.push(f);
  switch (f.kind) {
    case "not":
    case "box":
    case "dia":
    case "forall":
    case "exists":
      subformulas(f.sub, acc);
      break;
    case "and":
    case "or":
    case "imp":
    case "iff":
      subformulas(f.left, acc);
      subformulas(f.right, acc);
      break;
  }
  return acc;
}

/** Sentence letters (TFL atoms with no arguments), sorted. */
export function letters(f: Formula): string[] {
  const s = new Set<string>();
  for (const g of subformulas(f)) if (g.kind === "atom" && g.args.length === 0) s.add(g.pred);
  return [...s].sort(letterCompare);
}

export function letterCompare(a: string, b: string): number {
  const pa = a.match(/^([A-Z])(\d*)$/)!;
  const pb = b.match(/^([A-Z])(\d*)$/)!;
  if (pa[1] !== pb[1]) return pa[1] < pb[1] ? -1 : 1;
  return (parseInt(pa[2] || "0") || 0) - (parseInt(pb[2] || "0") || 0);
}

export function names(f: Formula, acc = new Set<string>()): Set<string> {
  const visit = (t: Term) => {
    if (t.kind === "name") acc.add(t.name);
  };
  for (const g of subformulas(f)) {
    if (g.kind === "atom") g.args.forEach(visit);
    if (g.kind === "eq") {
      visit(g.left);
      visit(g.right);
    }
  }
  return acc;
}

export function predicates(f: Formula): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of subformulas(f)) if (g.kind === "atom") m.set(g.pred, g.args.length);
  return m;
}

export function freeVars(f: Formula, bound = new Set<string>(), acc = new Set<string>()): Set<string> {
  const visit = (t: Term) => {
    if (t.kind === "var" && !bound.has(t.name)) acc.add(t.name);
  };
  switch (f.kind) {
    case "atom":
      f.args.forEach(visit);
      break;
    case "eq":
      visit(f.left);
      visit(f.right);
      break;
    case "bot":
      break;
    case "not":
    case "box":
    case "dia":
      freeVars(f.sub, bound, acc);
      break;
    case "forall":
    case "exists": {
      const b2 = new Set(bound);
      b2.add(f.v);
      freeVars(f.sub, b2, acc);
      break;
    }
    default:
      freeVars(f.left, bound, acc);
      freeVars(f.right, bound, acc);
  }
  return acc;
}

export function isSentence(f: Formula): boolean {
  return freeVars(f).size === 0;
}

/** Substitute term `to` for every free occurrence of variable `v`. */
export function substVar(f: Formula, v: string, to: Term): Formula {
  const st = (t: Term): Term => (t.kind === "var" && t.name === v ? to : t);
  switch (f.kind) {
    case "atom":
      return { kind: "atom", pred: f.pred, args: f.args.map(st) };
    case "eq":
      return { kind: "eq", left: st(f.left), right: st(f.right) };
    case "bot":
      return f;
    case "not":
    case "box":
    case "dia":
      return { kind: f.kind, sub: substVar(f.sub, v, to) };
    case "forall":
    case "exists":
      if (f.v === v) return f;
      return { kind: f.kind, v: f.v, sub: substVar(f.sub, v, to) };
    default:
      return { kind: f.kind, left: substVar(f.left, v, to), right: substVar(f.right, v, to) };
  }
}

/** Replace every occurrence of name a by name b. */
export function substName(f: Formula, a: string, b: string): Formula {
  const st = (t: Term): Term => (t.kind === "name" && t.name === a ? { kind: "name", name: b } : t);
  switch (f.kind) {
    case "atom":
      return { kind: "atom", pred: f.pred, args: f.args.map(st) };
    case "eq":
      return { kind: "eq", left: st(f.left), right: st(f.right) };
    case "bot":
      return f;
    case "not":
    case "box":
    case "dia":
      return { kind: f.kind, sub: substName(f.sub, a, b) };
    case "forall":
    case "exists":
      return { kind: f.kind, v: f.v, sub: substName(f.sub, a, b) };
    default:
      return { kind: f.kind, left: substName(f.left, a, b), right: substName(f.right, a, b) };
  }
}

/**
 * Can `target` be obtained from `src` by replacing SOME occurrences of name a with name b?
 * (Used for ∃I and =E.)
 */
export function someReplaced(src: Formula, target: Formula, a: string, b: string): boolean {
  const tOk = (x: Term, y: Term) => termEq(x, y) || (x.kind === "name" && x.name === a && y.kind === "name" && y.name === b);
  if (src.kind !== target.kind) return false;
  switch (src.kind) {
    case "atom": {
      const t = target as typeof src;
      return src.pred === t.pred && src.args.length === t.args.length && src.args.every((x, i) => tOk(x, t.args[i]));
    }
    case "eq": {
      const t = target as typeof src;
      return tOk(src.left, t.left) && tOk(src.right, t.right);
    }
    case "bot":
      return true;
    case "not":
    case "box":
    case "dia":
      return someReplaced(src.sub, (target as typeof src).sub, a, b);
    case "forall":
    case "exists": {
      const t = target as typeof src;
      return src.v === t.v && someReplaced(src.sub, t.sub, a, b);
    }
    default: {
      const t = target as typeof src;
      return someReplaced(src.left, t.left, a, b) && someReplaced(src.right, t.right, a, b);
    }
  }
}

/**
 * Can `target` be obtained from `src` by replacing SOME free occurrences of name c with variable v?
 * i.e. is src an instance of target w.r.t. c/v (for ∃I: target has x where src had c, some of them).
 */
export function someNameToVar(src: Formula, target: Formula, c: string, v: string): boolean {
  const tOk = (x: Term, y: Term) => termEq(x, y) || (x.kind === "name" && x.name === c && y.kind === "var" && y.name === v);
  if (src.kind !== target.kind) return false;
  switch (src.kind) {
    case "atom": {
      const t = target as typeof src;
      return src.pred === t.pred && src.args.length === t.args.length && src.args.every((x, i) => tOk(x, t.args[i]));
    }
    case "eq": {
      const t = target as typeof src;
      return tOk(src.left, t.left) && tOk(src.right, t.right);
    }
    case "bot":
      return true;
    case "not":
    case "box":
    case "dia":
      return someNameToVar(src.sub, (target as typeof src).sub, c, v);
    case "forall":
    case "exists": {
      const t = target as typeof src;
      if (src.v !== t.v) return false;
      if (t.v === v) return eq(src.sub, t.sub); // v rebound: no replacement inside
      return someNameToVar(src.sub, t.sub, c, v);
    }
    default: {
      const t = target as typeof src;
      return someNameToVar(src.left, t.left, c, v) && someNameToVar(src.right, t.right, c, v);
    }
  }
}

export function mainConnective(f: Formula): string | null {
  switch (f.kind) {
    case "not": return "¬";
    case "and": return "∧";
    case "or": return "∨";
    case "imp": return "→";
    case "iff": return "↔";
    case "forall": return "∀";
    case "exists": return "∃";
    case "box": return "□";
    case "dia": return "◇";
    default: return null;
  }
}
