// Parser for TFL / FOL / ML formulas.
//
// Accepts Unicode (¬ ∧ ∨ → ↔ ⊥ ∀ ∃ □ ◇), keyboard aliases
// (~ ! - for ¬; & ^ /\ for ∧; v | \/ for ∨; -> > for →; <-> <> for ↔;
//  # for ⊥; @ or "forall" for ∀; 3 or "exists" for ∃; [] for □; <> is ↔ so ◇ is "dia" or ◊),
// and LaTeX names (\lnot \land \lor \rightarrow \leftrightarrow \bot \forall \exists \Box \Diamond).
//
// `strict` mode enforces the book's bracketing: every binary compound carries
// brackets, except that the outermost pair may be dropped.

import type { Formula, Term } from "./ast";

export class ParseError extends Error {
  constructor(msg: string, public pos: number) {
    super(msg);
  }
}

type Tok =
  | { t: "not" | "and" | "or" | "imp" | "iff" | "bot" | "forall" | "exists" | "box" | "dia" | "lp" | "rp" | "comma" | "eq" | "therefore" | "turnstile" | "end"; pos: number }
  | { t: "pred"; name: string; pos: number }
  | { t: "system"; name: string; pos: number }
  | { t: "term"; name: string; pos: number };

const SUBS: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };

export function tokenize(src: string): Tok[] {
  const s = src.replace(/\s+/g, " ");
  const toks: Tok[] = [];
  let i = 0;
  const push = (t: Tok["t"], len: number) => {
    toks.push({ t, pos: i } as Tok);
    i += len;
  };
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "{" || c === "}") { i++; continue; }
    const rest = s.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\\(?:[,;!: ]|(?:quad|qquad|bigl|bigr|Bigl|Bigr|left|right|big|Big)(?![A-Za-z]))\s*/))) { i += m[0].length; continue; }
    if ((m = rest.match(/^\\([A-Za-z]+)\s*/))) {
      const name = m[1];
      const map: Record<string, Tok["t"]> = {
        lnot: "not", neg: "not", land: "and", wedge: "and", lor: "or", vee: "or",
        rightarrow: "imp", to: "imp", leftrightarrow: "iff", bot: "bot", forall: "forall",
        exists: "exists", Box: "box", Diamond: "dia", therefore: "therefore", vdash: "turnstile",
      };
      if (map[name]) { push(map[name], m[0].length); continue; }
      throw new ParseError(`Unknown symbol \\${name}`, i);
    }
    if (rest.startsWith("<->") || rest.startsWith("↔") || rest.startsWith("≡")) { push("iff", rest.startsWith("<->") ? 3 : 1); continue; }
    if (rest.startsWith("->") || rest.startsWith("→") || rest.startsWith("⊃")) { push("imp", rest.startsWith("->") ? 2 : 1); continue; }
    if (rest.startsWith("<>")) { push("iff", 2); continue; }
    if (rest.startsWith("[]")) { push("box", 2); continue; }
    if (rest.startsWith("/\\")) { push("and", 2); continue; }
    if (rest.startsWith("\\/")) { push("or", 2); continue; }
    if (rest.startsWith("_|_")) { push("bot", 3); continue; }
    if (/^(forall|all)\b/i.test(rest) && /^(forall|all)\s*[a-z]/i.test(rest)) { push("forall", rest.match(/^(forall|all)/i)![0].length); continue; }
    if (/^(exists|some)\b/i.test(rest) && /^(exists|some)\s*[a-z]/i.test(rest)) { push("exists", rest.match(/^(exists|some)/i)![0].length); continue; }
    if (/^dia\b/i.test(rest)) { push("dia", 3); continue; }
    const one: Record<string, Tok["t"]> = {
      "¬": "not", "~": "not", "!": "not", "-": "not", "−": "not", "∼": "not",
      "∧": "and", "&": "and", "^": "and", "·": "and", "•": "and",
      "∨": "or", "|": "or",
      "→": "imp", ">": "imp",
      "⊥": "bot", "#": "bot",
      "∀": "forall", "@": "forall",
      "∃": "exists", "3": "exists",
      "□": "box", "◻": "box", "■": "box",
      "◇": "dia", "◊": "dia", "♢": "dia", "⋄": "dia",
      "(": "lp", "[": "lp", ")": "rp", "]": "rp",
      ",": "comma", "=": "eq", "∴": "therefore", "⊢": "turnstile", "⊨": "turnstile",
      "∶": "therefore", ":": "therefore",
    };
    if (c === "_" && toks.length && toks[toks.length - 1].t === "turnstile") {
      const mm = rest.match(/^_\s*\{?\s*\\?(?:mathbf\{)?([A-Za-z0-9]+)\}?\}?/);
      if (mm) { toks.push({ t: "system", name: mm[1], pos: i }); i += mm[0].length; continue; }
    }
    if (one[c]) { push(one[c], 1); continue; }
    if ((m = rest.match(/^[A-Z](?:_\{?\d+\}?|\d+|[₀-₉]+)?/))) {
      const raw = m[0];
      const name = normName(raw);
      toks.push({ t: "pred", name, pos: i });
      i += raw.length;
      continue;
    }
    // "v" is a disjunction alias only when surrounded by spaces / brackets
    if (c === "v" && (i === 0 || /[\s)]/.test(s[i - 1])) && /[\s(¬~!A-Z]/.test(s[i + 1] ?? " ")) { push("or", 1); continue; }
    if ((m = rest.match(/^[a-z](?:_\{?\d+\}?|\d+|[₀-₉]+)?/))) {
      const raw = m[0];
      toks.push({ t: "term", name: normName(raw), pos: i });
      i += raw.length;
      continue;
    }
    throw new ParseError(`Unexpected character "${c}"`, i);
  }
  toks.push({ t: "end", pos: s.length });
  return toks;
}

function normName(raw: string): string {
  let s = raw.replace(/[_{}]/g, "");
  s = s.replace(/[₀-₉]/g, (d) => SUBS[d]);
  return s;
}

export interface ParseOptions {
  strict?: boolean;
  variables?: (name: string) => boolean;
}

const defaultIsVar = (n: string) => /^[s-z]\d*$/.test(n);

export function parseFormula(src: string, opts: ParseOptions = {}): Formula {
  const toks = tokenize(src);
  const p = new P(toks, opts);
  const f = p.formula(true);
  if (p.peek().t !== "end") throw new ParseError("Unexpected input after the formula", p.peek().pos);
  return f;
}

/** Parse "A, B ∴ C" / "A, B ⊢ C" / "∴ C". Returns premises and conclusion. */
export function parseArgument(src: string, opts: ParseOptions = {}): { premises: Formula[]; conclusion: Formula; system?: string } {
  const toks = tokenize(src);
  const p = new P(toks, opts);
  const premises: Formula[] = [];
  if (p.peek().t !== "therefore" && p.peek().t !== "turnstile") {
    premises.push(p.formula(true));
    while (p.peek().t === "comma") {
      p.next();
      premises.push(p.formula(true));
    }
  }
  const t = p.next();
  if (t.t !== "therefore" && t.t !== "turnstile") throw new ParseError("Expected ∴ or ⊢", t.pos);
  let system: string | undefined;
  if (p.peek().t === "system") system = (p.next() as { name: string }).name;
  const conclusion = p.formula(true);
  if (p.peek().t !== "end") throw new ParseError("Unexpected input after the conclusion", p.peek().pos);
  return { premises, conclusion, system };
}

class P {
  i = 0;
  isVar: (n: string) => boolean;
  constructor(public toks: Tok[], public opts: ParseOptions) {
    this.isVar = opts.variables ?? defaultIsVar;
  }
  peek(): Tok { return this.toks[this.i]; }
  next(): Tok { return this.toks[this.i++]; }
  expect(t: Tok["t"], msg: string): Tok {
    const k = this.next();
    if (k.t !== t) throw new ParseError(msg, k.pos);
    return k;
  }

  // In non-strict mode: precedence ¬/quantifiers/modals > ∧,∨ (left assoc, no mixing without brackets) > → (right assoc) > ↔
  formula(outermost: boolean): Formula {
    if (this.opts.strict) return this.strictFormula(outermost);
    return this.iff();
  }

  iff(): Formula {
    let left = this.imp();
    while (this.peek().t === "iff") {
      this.next();
      const right = this.imp();
      left = { kind: "iff", left, right };
    }
    return left;
  }
  imp(): Formula {
    const left = this.andor();
    if (this.peek().t === "imp") {
      this.next();
      const right = this.imp();
      return { kind: "imp", left, right };
    }
    return left;
  }
  andor(): Formula {
    let left = this.unary();
    let op: "and" | "or" | null = null;
    while (this.peek().t === "and" || this.peek().t === "or") {
      const t = this.next();
      const k = t.t as "and" | "or";
      if (op && op !== k) throw new ParseError("Mixing ∧ and ∨ needs brackets", t.pos);
      op = k;
      const right = this.unary();
      left = { kind: k, left, right };
    }
    return left;
  }
  unary(): Formula {
    const t = this.peek();
    if (t.t === "not") { this.next(); return { kind: "not", sub: this.unary() }; }
    if (t.t === "box") { this.next(); return { kind: "box", sub: this.unary() }; }
    if (t.t === "dia") { this.next(); return { kind: "dia", sub: this.unary() }; }
    if (t.t === "forall" || t.t === "exists") {
      this.next();
      const v = this.next();
      if (v.t !== "term" || !this.isVar(v.name)) throw new ParseError("A quantifier must be followed by a variable (x, y or z)", v.pos);
      return { kind: t.t, v: v.name, sub: this.unary() };
    }
    return this.atomic();
  }
  atomic(): Formula {
    const t = this.next();
    if (t.t === "lp") {
      const f = this.formula(false);
      this.expect("rp", "Missing closing bracket");
      return f;
    }
    if (t.t === "bot") return { kind: "bot" };
    if (t.t === "pred") {
      if (this.peek().t === "lp") {
        this.next();
        const args: Term[] = [this.term()];
        while (this.peek().t === "comma") { this.next(); args.push(this.term()); }
        this.expect("rp", "Missing closing bracket after predicate arguments");
        return { kind: "atom", pred: t.name, args };
      }
      // juxtaposed terms: Rab style (not the book's style, but accepted)
      const args: Term[] = [];
      while (this.peek().t === "term") args.push(this.term());
      return { kind: "atom", pred: t.name, args };
    }
    if (t.t === "term") {
      // identity: t = t
      const left = this.mkTerm(t.name);
      this.expect("eq", `"${t.name}" must be followed by = (or be an argument of a predicate)`);
      const r = this.next();
      if (r.t !== "term") throw new ParseError("= must be followed by a name or variable", r.pos);
      return { kind: "eq", left, right: this.mkTerm(r.name) };
    }
    if (t.t === "end") throw new ParseError("The formula ends too early", t.pos);
    throw new ParseError("Expected a sentence letter, predicate, ¬, quantifier or bracket here", t.pos);
  }
  term(): Term {
    const t = this.next();
    if (t.t !== "term") throw new ParseError("Expected a name or variable", t.pos);
    return this.mkTerm(t.name);
  }
  mkTerm(name: string): Term {
    return this.isVar(name) ? { kind: "var", name } : { kind: "name", name };
  }

  // Strict grammar: F ::= atom | ¬F | ∀xF | (F ∧ F) | ... ; outermost brackets optional
  strictFormula(outermost: boolean): Formula {
    const u = this.strictPrimary();
    if (outermost) {
      const op = this.peek();
      if (op.t === "and" || op.t === "or" || op.t === "imp" || op.t === "iff") {
        this.next();
        const right = this.strictPrimary();
        if (this.peek().t !== "end") throw new ParseError("Only the outermost brackets may be dropped", this.peek().pos);
        return { kind: op.t, left: u, right };
      }
    }
    return u;
  }
  strictPrimary(): Formula {
    const t = this.peek();
    if (t.t === "lp") {
      // bracketed: either an atom-ish group or a binary compound
      this.next();
      const left = this.strictFormula(false);
      const op = this.peek();
      if (op.t === "and" || op.t === "or" || op.t === "imp" || op.t === "iff") {
        this.next();
        const right = this.strictFormula(false);
        this.expect("rp", "Missing closing bracket");
        return { kind: op.t, left, right };
      }
      if (op.t === "rp") {
        this.next();
        // brackets around a non-binary formula are not allowed in strict TFL... but tolerate outermost
        throw new ParseError("Brackets may only surround a binary compound", t.pos);
      }
      throw new ParseError("Expected a connective inside the brackets", op.pos);
    }
    return this.strictUnary();
  }
  strictUnary(): Formula {
    const t = this.peek();
    if (t.t === "not") { this.next(); return { kind: "not", sub: this.strictUnary() }; }
    if (t.t === "box") { this.next(); return { kind: "box", sub: this.strictUnary() }; }
    if (t.t === "dia") { this.next(); return { kind: "dia", sub: this.strictUnary() }; }
    if (t.t === "forall" || t.t === "exists") {
      this.next();
      const v = this.next();
      if (v.t !== "term" || !this.isVar(v.name)) throw new ParseError("A quantifier must be followed by a variable", v.pos);
      return { kind: t.t, v: v.name, sub: this.strictUnary() };
    }
    if (t.t === "lp") return this.strictPrimary();
    return this.atomic();
  }
}

export function tryParse(src: string, opts?: ParseOptions): { ok: true; f: Formula } | { ok: false; error: string; pos: number } {
  try {
    return { ok: true, f: parseFormula(src, opts) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, pos: e.pos };
    throw e;
  }
}
