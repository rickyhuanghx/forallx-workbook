// Fitch-style natural deduction checker for the proof systems of forall x: Calgary
// (TFL basic + derived rules, FOL quantifier and identity rules, and the modal
// systems K, T, S4, S5 with strict subproofs).

import type { Formula } from "./ast";
import { eq, freeVars, isBinary, names, someNameToVar, someReplaced, substVar } from "./ast";
import { parseFormula, ParseError } from "./parser";

export interface InputLine {
  formula: string;   // text; "□" alone marks a strict (modal) subproof assumption
  rule: string;      // e.g. "∧I", "PR", "AS"
  refs: string;      // e.g. "1, 2" or "3–5"
  depth: number;     // 0 = main proof
}

export interface LineResult {
  ok: boolean;
  error?: string;
  parsed?: Formula;
  isBoxMarker?: boolean;
}

export interface CheckResult {
  lines: LineResult[];
  complete: boolean;         // every line fine and the last line is at depth 0
  conclusion?: Formula;      // formula on the last line, if at depth 0
}

export const RULES = ["PR", "AS", "R", "∧I", "∧E", "∨I", "∨E", "→I", "→E", "↔I", "↔E", "¬I", "¬E", "X", "IP",
  "DNE", "MT", "DS", "LEM", "DeM", "∀I", "∀E", "∃I", "∃E", "=I", "=E", "CQ", "□I", "□E", "MC", "Def◇", "RT", "R4", "R5"] as const;

export function normalizeRule(r: string): string {
  let s = r.replace(/\s+/g, "").replace(/\*/g, "");
  s = s.replace(/^\^|^&|^\/\\/, "∧").replace(/^v|^\||^\\\//i, "∨").replace(/^->|^>/, "→").replace(/^<->|^<>/, "↔")
    .replace(/^~|^!|^¬/, "¬").replace(/^@|^A(?=[IE]$)/, "∀").replace(/^3|^E(?=[IE]$)/, "∃").replace(/^\[\]|^box/i, "□")
    .replace(/^def(<>|◇|◊|dia)$/i, "Def◇").replace(/^(lem|tnd)$/i, "LEM").replace(/^dem$/i, "DeM").replace(/^dne$/i, "DNE")
    .replace(/^ip$/i, "IP").replace(/^mt$/i, "MT").replace(/^ds$/i, "DS").replace(/^cq$/i, "CQ").replace(/^mc$/i, "MC")
    .replace(/^pr$/i, "PR").replace(/^as$/i, "AS").replace(/^x$/i, "X").replace(/^r$/i, "R").replace(/^rt$/i, "RT")
    .replace(/^r4$/i, "R4").replace(/^r5$/i, "R5");
  s = s.replace(/i$/, "I").replace(/e$/, "E");
  if (s === "¬E" || s === "⊥I") s = "¬E";
  return s;
}

type Ref = { kind: "line"; n: number } | { kind: "sub"; i: number; j: number };

function parseRefs(s: string): Ref[] | string {
  const out: Ref[] = [];
  const t = s.trim();
  if (!t) return out;
  for (const part of t.split(/[,;]/)) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^\(?(\d+)\)?\s*[-–—]\s*\(?(\d+)\)?$/);
    if (m) { out.push({ kind: "sub", i: +m[1], j: +m[2] }); continue; }
    const n = p.match(/^\(?(\d+)\)?$/);
    if (n) { out.push({ kind: "line", n: +n[1] }); continue; }
    return `Cannot read the citation "${p}"`;
  }
  return out;
}

interface Node {
  id: number;
  parent: Node | null;
  depth: number;
  strict: boolean;
  first: number;  // line index (1-based) of the assumption
  last: number;
  lines: number[]; // direct lines (1-based) that belong to this subproof
}

export function checkProof(input: InputLine[], opts: { allowed?: Set<string> } = {}): CheckResult {
  const n = input.length;
  const results: LineResult[] = input.map(() => ({ ok: true }));
  const parsed: (Formula | null)[] = [];
  const isBox: boolean[] = [];

  // ---- parse formulas
  for (let i = 0; i < n; i++) {
    const text = input[i].formula.trim();
    if (text === "□" || text === "[]" || text === "box") {
      parsed.push(null);
      isBox.push(true);
      results[i].isBoxMarker = true;
      if (!(input[i].depth > 0 && (i === 0 || input[i - 1].depth < input[i].depth)))
        results[i] = { ok: false, error: "A □ marker must be the assumption line that opens a subproof", isBoxMarker: true };
      continue;
    }
    isBox.push(false);
    try {
      const f = parseFormula(text);
      parsed.push(f);
      results[i].parsed = f;
      if (freeVars(f).size) results[i] = { ok: false, error: `Not a sentence: variable ${[...freeVars(f)][0]} is free`, parsed: f };
    } catch (e) {
      parsed.push(null);
      results[i] = { ok: false, error: text ? (e as ParseError).message : "Enter a formula" };
    }
  }

  // ---- structure: build subproof tree from depths
  const root: Node = { id: 0, parent: null, depth: 0, strict: false, first: 0, last: n, lines: [] };
  const nodeOf: Node[] = []; // per line (0-based)
  let cur = root;
  let nextId = 1;
  for (let i = 0; i < n; i++) {
    const d = input[i].depth;
    const num = i + 1;
    if (d > cur.depth + 1) {
      results[i] = { ...results[i], ok: false, error: "A subproof can only be nested one level deeper than the line before it" };
    }
    while (d < cur.depth) {
      cur.last = i; // previous line was the last of cur
      cur = cur.parent!;
    }
    // an assumption (or □ marker) at the current subproof's own depth closes it and opens a sibling
    if (cur !== root && d === cur.depth && (isBox[i] || normalizeRule(input[i].rule) === "AS")) {
      cur.last = i;
      cur = cur.parent!;
    }
    if (d === cur.depth + 1) {
      const node: Node = { id: nextId++, parent: cur, depth: d, strict: isBox[i], first: num, last: num, lines: [] };
      cur = node;
      const rule = normalizeRule(input[i].rule);
      if (!isBox[i] && rule !== "AS") results[i] = { ...results[i], ok: results[i].ok && false, error: results[i].error ?? "The first line of a subproof must be an assumption (AS)" };
    } else if (d === cur.depth) {
      const rule = normalizeRule(input[i].rule);
      if (rule === "AS" && cur === root) results[i] = { ...results[i], ok: false, error: "Assumptions must open a subproof (indent the line). Premises use PR" };
    }
    cur.lines.push(num);
    cur.last = num;
    nodeOf.push(cur);
  }
  while (cur !== root) { cur = cur.parent!; }

  const ancestors = (node: Node): Node[] => { const a: Node[] = []; let x: Node | null = node; while (x) { a.push(x); x = x.parent; } return a; };
  const nodeFirstLine = new Map<number, Node>(); // first line -> node
  const collect = (node: Node) => { if (node !== root) nodeFirstLine.set(node.first, node); };
  for (const nd of nodeOf) collect(nd);

  const innermostStrict = (node: Node): Node | null => { let x: Node | null = node; while (x) { if (x.strict) return x; x = x.parent; } return null; };

  // Is line k (1-based) citable from line num under ordinary rules?
  const lineAccessible = (k: number, num: number): string | null => {
    if (k < 1 || k > n) return `Line ${k} does not exist`;
    if (k >= num) return `Line ${k} comes after (or is) this line`;
    const nk = nodeOf[k - 1];
    const nn = nodeOf[num - 1];
    const anc = ancestors(nn);
    if (!anc.includes(nk)) return `Line ${k} is inside a subproof that has already been closed`;
    const S = innermostStrict(nn);
    if (S && !ancestors(nk).includes(S)) return `Line ${k} lies outside the strict subproof. Bring it in with □E (or R4/R5)`;
    return null;
  };
  // Citable from outside the nearest strict subproof (for □E, R4, R5)
  const outsideStrictAccessible = (k: number, num: number): string | null => {
    if (k < 1 || k > n) return `Line ${k} does not exist`;
    if (k >= num) return `Line ${k} comes after (or is) this line`;
    const nn = nodeOf[num - 1];
    const S = innermostStrict(nn);
    if (!S) return "This rule can only be used inside a strict subproof (one opened with □)";
    const nk = nodeOf[k - 1];
    if (!ancestors(nn).includes(nk)) return `Line ${k} is inside a subproof that has already been closed`;
    if (ancestors(nk).includes(S)) return `Line ${k} is already inside the strict subproof; use R instead`;
    const S2 = innermostStrict(S.parent!);
    if (S2 && !ancestors(nk).includes(S2)) return `Line ${k} is more than one strict subproof away`;
    return null;
  };
  const subAccessible = (i: number, j: number, num: number): Node | string => {
    const node = nodeFirstLine.get(i);
    if (!node) return `Line ${i} does not open a subproof`;
    if (node.last !== j) return `The subproof starting at line ${i} ends at line ${node.last}, not ${j}`;
    if (j >= num) return `The subproof ${i}–${j} must end before this line`;
    const nn = nodeOf[num - 1];
    if (!ancestors(nn).includes(node.parent!)) return `The subproof ${i}–${j} is inside a subproof that has already been closed`;
    if (nodeOf[j - 1] !== node) return `Line ${j} is inside a nested subproof; a cited subproof must end at its own level`;
    const S = innermostStrict(nn);
    if (S && !ancestors(node).includes(S)) return `The subproof ${i}–${j} lies outside the current strict subproof`;
    if (node.strict && normalizeRule(input[num - 1].rule) !== "□I") return `The subproof ${i}–${j} is a strict subproof; only □I can cite it`;
    return node;
  };

  // undischarged assumptions in force at line num (premises and open assumptions), excluding `except`
  const openAssumptions = (num: number, except: Node | null = null): Formula[] => {
    const out: Formula[] = [];
    const nn = nodeOf[num - 1];
    for (const a of ancestors(nn)) {
      if (a === root) {
        for (const k of a.lines) if (k < num && normalizeRule(input[k - 1].rule) === "PR" && parsed[k - 1]) out.push(parsed[k - 1]!);
      } else if (a !== except && !a.strict && parsed[a.first - 1]) out.push(parsed[a.first - 1]!);
    }
    return out;
  };

  // ---- check each line
  for (let i = 0; i < n; i++) {
    if (!results[i].ok) continue;
    const num = i + 1;
    const f = parsed[i];
    const rule = normalizeRule(input[i].rule);
    const refsOrErr = parseRefs(input[i].refs);
    const fail = (msg: string) => { results[i] = { ...results[i], ok: false, error: msg }; };
    if (typeof refsOrErr === "string") { fail(refsOrErr); continue; }
    const refs = refsOrErr;
    if (isBox[i]) { if (rule && rule !== "AS") fail("A □ marker takes no rule"); continue; }
    if (!f) continue;
    if (opts.allowed && rule && !opts.allowed.has(rule) && rule !== "PR" && rule !== "AS") { fail(`The rule ${rule} is not available in this exercise`); continue; }

    const lineRefs = refs.filter((r): r is Extract<Ref, { kind: "line" }> => r.kind === "line");
    const subRefs = refs.filter((r): r is Extract<Ref, { kind: "sub" }> => r.kind === "sub");
    const want = (lines: number, subs: number): boolean => {
      if (lineRefs.length !== lines || subRefs.length !== subs) {
        const parts: string[] = [];
        if (lines) parts.push(`${lines} line${lines > 1 ? "s" : ""}`);
        if (subs) parts.push(`${subs} subproof${subs > 1 ? "s" : ""}`);
        fail(`${rule} cites ${parts.join(" and ") || "nothing"}`);
        return false;
      }
      return true;
    };
    // fetch cited formulas, checking accessibility
    const getLine = (k: number, outside = false): Formula | null => {
      const err = outside ? outsideStrictAccessible(k, num) : lineAccessible(k, num);
      if (err) { fail(err); return null; }
      const g = parsed[k - 1];
      if (!g) { fail(`Line ${k} has no formula`); return null; }
      return g;
    };
    const getSub = (r: Extract<Ref, { kind: "sub" }>): { assume: Formula | null; last: Formula; node: Node } | null => {
      const node = subAccessible(r.i, r.j, num);
      if (typeof node === "string") { fail(node); return null; }
      const last = parsed[r.j - 1];
      if (!last) { fail(`Line ${r.j} has no formula`); return null; }
      return { assume: parsed[r.i - 1], last, node };
    };
    const show = (g: Formula) => toText(g);

    switch (rule) {
      case "":
        fail("Give a rule for this line");
        break;
      case "PR":
        if (nodeOf[i] !== root) fail("Premises can only appear in the main proof");
        else if (i > 0 && !input.slice(0, i).every((l) => normalizeRule(l.rule) === "PR")) fail("Premises must come first, before any other line");
        break;
      case "AS":
        break; // structure already checked
      case "R": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (!eq(g, f)) fail(`R repeats line ${lineRefs[0].n} exactly: it must read ${show(g)}`);
        break;
      }
      case "∧I": {
        if (lineRefs.length === 1 && subRefs.length === 0 && f.kind === "and" && eq(f.left, f.right)) {
          const a = getLine(lineRefs[0].n); if (!a) break;
          if (!eq(a, f.left)) fail(`∧I with one citation needs both conjuncts to be line ${lineRefs[0].n}`);
          break;
        }
        if (!want(2, 0)) break;
        const a = getLine(lineRefs[0].n); if (!a) break;
        const b = getLine(lineRefs[1].n); if (!b) break;
        if (f.kind !== "and") { fail("∧I must produce a conjunction"); break; }
        const okOrder = eq(f.left, a) && eq(f.right, b);
        const okSwap = eq(f.left, b) && eq(f.right, a);
        if (!okOrder && !okSwap) fail(`∧I needs the two conjuncts on the cited lines; lines ${lineRefs[0].n} and ${lineRefs[1].n} give ${show(a)} and ${show(b)}`);
        break;
      }
      case "∧E": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (g.kind !== "and") { fail(`∧E applies to a conjunction, but line ${lineRefs[0].n} is ${show(g)}`); break; }
        if (!eq(g.left, f) && !eq(g.right, f)) fail(`∧E gives one conjunct of line ${lineRefs[0].n}: ${show(g.left)} or ${show(g.right)}`);
        break;
      }
      case "∨I": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (f.kind !== "or") { fail("∨I must produce a disjunction"); break; }
        if (!eq(f.left, g) && !eq(f.right, g)) fail(`One disjunct must be line ${lineRefs[0].n}, ${show(g)}`);
        break;
      }
      case "∨E": {
        if (!want(1, 2)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (g.kind !== "or") { fail(`∨E applies to a disjunction, but line ${lineRefs[0].n} is ${show(g)}`); break; }
        const s1 = getSub(subRefs[0]); if (!s1) break;
        const s2 = getSub(subRefs[1]); if (!s2) break;
        if (!s1.assume || !s2.assume) { fail("Cited subproofs must start with an assumption"); break; }
        const pair = (x: typeof s1, y: typeof s2) => eq(x.assume!, g.left) && eq(y.assume!, g.right);
        if (!pair(s1, s2) && !pair(s2, s1)) { fail(`The subproofs must assume the two disjuncts ${show(g.left)} and ${show(g.right)}`); break; }
        if (!eq(s1.last, f) || !eq(s2.last, f)) fail(`Both subproofs must end with this line's formula, ${show(f)}`);
        break;
      }
      case "→I": {
        if (!want(0, 1)) break;
        const s = getSub(subRefs[0]); if (!s) break;
        if (!s.assume) { fail("The cited subproof must start with an assumption"); break; }
        if (f.kind !== "imp") { fail("→I must produce a conditional"); break; }
        if (!eq(f.left, s.assume)) { fail(`The antecedent must be the assumption of the subproof, ${show(s.assume)}`); break; }
        if (!eq(f.right, s.last)) fail(`The consequent must be the last line of the subproof, ${show(s.last)}`);
        break;
      }
      case "→E": {
        if (!want(2, 0)) break;
        const a = getLine(lineRefs[0].n); if (!a) break;
        const b = getLine(lineRefs[1].n); if (!b) break;
        const tryIt = (cond: Formula, ant: Formula) => cond.kind === "imp" && eq(cond.left, ant) && eq(cond.right, f);
        if (!tryIt(a, b) && !tryIt(b, a)) fail(`→E needs a conditional and its antecedent; the consequent must then be this line`);
        break;
      }
      case "↔I": {
        if (!want(0, 2)) break;
        const s1 = getSub(subRefs[0]); if (!s1) break;
        const s2 = getSub(subRefs[1]); if (!s2) break;
        if (!s1.assume || !s2.assume) { fail("Cited subproofs must start with an assumption"); break; }
        if (f.kind !== "iff") { fail("↔I must produce a biconditional"); break; }
        const fits = (x: typeof s1, y: typeof s2) => eq(x.assume!, f.left) && eq(x.last, f.right) && eq(y.assume!, f.right) && eq(y.last, f.left);
        if (!fits(s1, s2) && !fits(s2, s1)) fail("One subproof must go from the left side to the right, the other from the right side to the left");
        break;
      }
      case "↔E": {
        if (!want(2, 0)) break;
        const a = getLine(lineRefs[0].n); if (!a) break;
        const b = getLine(lineRefs[1].n); if (!b) break;
        const tryIt = (bi: Formula, side: Formula) => bi.kind === "iff" && ((eq(bi.left, side) && eq(bi.right, f)) || (eq(bi.right, side) && eq(bi.left, f)));
        if (!tryIt(a, b) && !tryIt(b, a)) fail("↔E needs a biconditional and one of its sides; this line must be the other side");
        break;
      }
      case "¬I": {
        if (!want(0, 1)) break;
        const s = getSub(subRefs[0]); if (!s) break;
        if (!s.assume) { fail("The cited subproof must start with an assumption"); break; }
        if (s.last.kind !== "bot") { fail("The subproof must end with ⊥"); break; }
        if (f.kind !== "not" || !eq(f.sub, s.assume)) fail(`¬I gives the negation of the assumption: ¬${wrap(s.assume)}`);
        break;
      }
      case "¬E": {
        if (!want(2, 0)) break;
        const a = getLine(lineRefs[0].n); if (!a) break;
        const b = getLine(lineRefs[1].n); if (!b) break;
        if (f.kind !== "bot") { fail("¬E produces ⊥"); break; }
        const tryIt = (neg: Formula, pos: Formula) => neg.kind === "not" && eq(neg.sub, pos);
        if (!tryIt(a, b) && !tryIt(b, a)) fail("¬E needs a sentence and its negation");
        break;
      }
      case "X": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (g.kind !== "bot") fail(`X applies to ⊥, but line ${lineRefs[0].n} is ${show(g)}`);
        break;
      }
      case "IP": {
        if (!want(0, 1)) break;
        const s = getSub(subRefs[0]); if (!s) break;
        if (!s.assume) { fail("The cited subproof must start with an assumption"); break; }
        if (s.last.kind !== "bot") { fail("The subproof must end with ⊥"); break; }
        if (s.assume.kind !== "not" || !eq(s.assume.sub, f)) fail(`IP needs a subproof assuming ¬${wrap(f)} that ends in ⊥`);
        break;
      }
      case "DNE": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (g.kind !== "not" || g.sub.kind !== "not" || !eq(g.sub.sub, f)) fail(`DNE removes a double negation: line ${lineRefs[0].n} must be ¬¬${wrap(f)}`);
        break;
      }
      case "MT": {
        if (!want(2, 0)) break;
        const a = getLine(lineRefs[0].n); if (!a) break;
        const b = getLine(lineRefs[1].n); if (!b) break;
        const tryIt = (cond: Formula, neg: Formula) => cond.kind === "imp" && neg.kind === "not" && eq(neg.sub, cond.right) && f.kind === "not" && eq(f.sub, cond.left);
        if (!tryIt(a, b) && !tryIt(b, a)) fail("MT needs a conditional and the negation of its consequent; this line must negate the antecedent");
        break;
      }
      case "DS": {
        if (!want(2, 0)) break;
        const a = getLine(lineRefs[0].n); if (!a) break;
        const b = getLine(lineRefs[1].n); if (!b) break;
        const tryIt = (dis: Formula, neg: Formula) => dis.kind === "or" && neg.kind === "not" && ((eq(neg.sub, dis.left) && eq(f, dis.right)) || (eq(neg.sub, dis.right) && eq(f, dis.left)));
        if (!tryIt(a, b) && !tryIt(b, a)) fail("DS needs a disjunction and the negation of one disjunct; this line must be the other disjunct");
        break;
      }
      case "LEM": {
        if (!want(0, 2)) break;
        const s1 = getSub(subRefs[0]); if (!s1) break;
        const s2 = getSub(subRefs[1]); if (!s2) break;
        if (!s1.assume || !s2.assume) { fail("Cited subproofs must start with an assumption"); break; }
        const fits = (x: typeof s1, y: typeof s2) => y.assume!.kind === "not" && eq(y.assume!.sub, x.assume!);
        if (!fits(s1, s2) && !fits(s2, s1)) { fail("LEM needs one subproof assuming a sentence and another assuming its negation"); break; }
        if (!eq(s1.last, f) || !eq(s2.last, f)) fail(`Both subproofs must end with this line's formula, ${show(f)}`);
        break;
      }
      case "DeM": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (!deMorgan(g, f) && !deMorgan(f, g)) fail("DeM converts between ¬(𝒜 ∨ ℬ) and ¬𝒜 ∧ ¬ℬ, or between ¬(𝒜 ∧ ℬ) and ¬𝒜 ∨ ¬ℬ");
        break;
      }
      case "∀E": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (g.kind !== "forall") { fail(`∀E applies to a universal, but line ${lineRefs[0].n} is ${show(g)}`); break; }
        const ok = [...names(f)].some((c) => eq(substVar(g.sub, g.v, { kind: "name", name: c }), f)) || eq(g.sub, f);
        if (!ok) fail(`This line must be an instance of line ${lineRefs[0].n}: replace every ${g.v} in ${show(g.sub)} by one name`);
        break;
      }
      case "∀I": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (f.kind !== "forall") { fail("∀I must produce a universal"); break; }
        const cands = [...names(g)].filter((c) => eq(substVar(f.sub, f.v, { kind: "name", name: c }), g));
        if (!cands.length) {
          if (eq(f.sub, g)) break; // vacuous quantification
          fail(`Line ${lineRefs[0].n} must result from ${show(f.sub)} by replacing every ${f.v} with one name`);
          break;
        }
        const c = cands.find((cc) => !names(f).has(cc));
        if (!c) { fail(`The name ${cands[0]} still occurs in the universal; every occurrence must be replaced by ${f.v}`); break; }
        const bad = openAssumptions(num).find((a) => names(a).has(c));
        if (bad) fail(`∀I: the name ${c} occurs in an undischarged assumption (${show(bad)})`);
        break;
      }
      case "∃I": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (f.kind !== "exists") { fail("∃I must produce an existential"); break; }
        const ok = [...names(g)].some((c) => someNameToVar(g, f.sub, c, f.v)) || eq(g, f.sub);
        if (!ok) fail(`Line ${lineRefs[0].n} must be ${show(f.sub)} with some occurrences of ${f.v} replaced by a single name`);
        break;
      }
      case "∃E": {
        if (!want(1, 1)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (g.kind !== "exists") { fail(`∃E applies to an existential, but line ${lineRefs[0].n} is ${show(g)}`); break; }
        const s = getSub(subRefs[0]); if (!s) break;
        if (!s.assume) { fail("The cited subproof must start with an assumption"); break; }
        if (!eq(s.last, f)) { fail(`The subproof must end with this line's formula, ${show(f)}`); break; }
        const cands = [...names(s.assume)].filter((c) => eq(substVar(g.sub, g.v, { kind: "name", name: c }), s.assume!));
        if (!cands.length) { fail(`The subproof must assume an instance of ${show(g.sub)} with a new name for ${g.v}`); break; }
        const c = cands.find((cc) => !names(g).has(cc) && !names(f).has(cc));
        if (!c) { fail(`∃E: the name ${cands[0]} must not occur in the existential or in the conclusion`); break; }
        const bad = openAssumptions(num, s.node).find((a) => names(a).has(c));
        if (bad) fail(`∃E: the name ${c} occurs in an undischarged assumption (${show(bad)})`);
        break;
      }
      case "=I": {
        if (!want(0, 0)) break;
        if (f.kind !== "eq" || f.left.kind !== "name" || !(f.left.name === f.right.name && f.right.kind === "name")) fail("=I gives a sentence of the form c = c");
        break;
      }
      case "=E": {
        if (!want(2, 0)) break;
        const a = getLine(lineRefs[0].n); if (!a) break;
        const b = getLine(lineRefs[1].n); if (!b) break;
        const tryIt = (id: Formula, src: Formula) => id.kind === "eq" && id.left.kind === "name" && id.right.kind === "name" &&
          (someReplaced(src, f, id.left.name, id.right.name) || someReplaced(src, f, id.right.name, id.left.name));
        if (!tryIt(a, b) && !tryIt(b, a)) fail("=E needs an identity a = b and a sentence; this line replaces some occurrences of a by b (or b by a)");
        break;
      }
      case "CQ": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (!cq(g, f) && !cq(f, g)) fail("CQ converts between ∀x¬𝒜 and ¬∃x𝒜, or between ∃x¬𝒜 and ¬∀x𝒜");
        break;
      }
      case "□I": {
        if (!want(0, 1)) break;
        const r = subRefs[0];
        const node = subAccessible(r.i, r.j, num);
        if (typeof node === "string") { fail(node); break; }
        if (!node.strict) { fail("□I cites a strict subproof (one whose assumption line is □)"); break; }
        const last = parsed[r.j - 1];
        if (!last) { fail(`Line ${r.j} has no formula`); break; }
        if (f.kind !== "box" || !eq(f.sub, last)) fail(`□I gives □ followed by the last line of the strict subproof: □${wrap(last)}`);
        break;
      }
      case "□E": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n, true); if (!g) break;
        if (g.kind !== "box" || !eq(g.sub, f)) fail(`□E: line ${lineRefs[0].n} must be □${wrap(f)}`);
        break;
      }
      case "R4": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n, true); if (!g) break;
        if (g.kind !== "box" || !eq(g, f)) fail(`R4 brings a □-sentence into a strict subproof unchanged`);
        break;
      }
      case "R5": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n, true); if (!g) break;
        if (g.kind !== "not" || g.sub.kind !== "box" || !eq(g, f)) fail(`R5 brings a sentence of the form ¬□𝒜 into a strict subproof unchanged`);
        break;
      }
      case "RT": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (g.kind !== "box" || !eq(g.sub, f)) fail(`RT: line ${lineRefs[0].n} must be □${wrap(f)}`);
        break;
      }
      case "MC": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        if (!modalConv(g, f) && !modalConv(f, g)) fail("MC converts between ¬□𝒜 and ◇¬𝒜, or between ¬◇𝒜 and □¬𝒜");
        break;
      }
      case "Def◇": {
        if (!want(1, 0)) break;
        const g = getLine(lineRefs[0].n); if (!g) break;
        const def = (x: Formula, y: Formula) => x.kind === "dia" && y.kind === "not" && y.sub.kind === "box" && y.sub.sub.kind === "not" && eq(y.sub.sub.sub, x.sub);
        if (!def(g, f) && !def(f, g)) fail("Def◇ converts between ◇𝒜 and ¬□¬𝒜");
        break;
      }
      default:
        fail(`Unknown rule "${input[i].rule}"`);
    }
  }

  const allOk = results.every((r) => r.ok);
  const last = input[n - 1];
  const complete = allOk && n > 0 && last.depth === 0 && !!parsed[n - 1];
  return { lines: results, complete, conclusion: complete ? parsed[n - 1]! : undefined };
}

function deMorgan(from: Formula, to: Formula): boolean {
  // ¬(A ∨ B) => ¬A ∧ ¬B ; ¬(A ∧ B) => ¬A ∨ ¬B
  if (from.kind === "not" && isBinary(from.sub) && (from.sub.kind === "or" || from.sub.kind === "and")) {
    const want = from.sub.kind === "or" ? "and" : "or";
    return to.kind === want && to.left.kind === "not" && to.right.kind === "not" && eq(to.left.sub, from.sub.left) && eq(to.right.sub, from.sub.right);
  }
  return false;
}

function cq(from: Formula, to: Formula): boolean {
  // ∀x¬A => ¬∃xA ; ∃x¬A => ¬∀xA
  if ((from.kind === "forall" || from.kind === "exists") && from.sub.kind === "not") {
    const dual = from.kind === "forall" ? "exists" : "forall";
    return to.kind === "not" && to.sub.kind === dual && to.sub.v === from.v && eq(to.sub.sub, from.sub.sub);
  }
  return false;
}

function modalConv(from: Formula, to: Formula): boolean {
  // ¬□A => ◇¬A ; ¬◇A => □¬A
  if (from.kind === "not" && (from.sub.kind === "box" || from.sub.kind === "dia")) {
    const dual = from.sub.kind === "box" ? "dia" : "box";
    return to.kind === dual && to.sub.kind === "not" && eq(to.sub.sub, from.sub.sub);
  }
  return false;
}

import { toUnicode } from "./print";
function toText(f: Formula): string { return toUnicode(f); }
function wrap(f: Formula): string { return isBinary(f) ? `(${toUnicode(f)})` : toUnicode(f); }
