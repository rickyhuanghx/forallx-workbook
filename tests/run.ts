// Replays the book's own proofs and truth tables through the engine.
// Run: npm test
import fs from "node:fs";
import path from "node:path";
import { checkProof, type InputLine } from "../src/logic/nd";
import { parseFormula, parseArgument } from "../src/logic/parser";
import { toUnicode, displayTokens } from "../src/logic/print";
import { truthTable, equivalent, isTFL } from "../src/logic/tfl";
import { sampleEquivalent, sampleCounterexample, monadicEquivalent, isFOL } from "../src/logic/fol";
import { counterexample } from "../src/logic/tfl";
import { ruleSet } from "../src/logic/rules";
import { proofSpecs } from "../src/logic/specs";
import { normalizeRule } from "../src/logic/nd";
import { eq as fEq } from "../src/logic/ast";
import { isSentence } from "../src/logic/ast";
import { applyShortcuts } from "../src/logic/shortcuts";
import { mergeProgress } from "../src/state/sync";
import { clientBucket, crossSite, normalizeEmail, parseCookies, sessionCookie, signSession, verifySession, COOKIE } from "../src/server/auth";
import type { Progress } from "../src/state/progress";

const BUILD = path.join(process.cwd(), "content", "build", "chapters");

let pass = 0, fail = 0, skipped = 0;
const failures: string[] = [];

function walk(obj: any, fn: (n: any) => void) {
  if (Array.isArray(obj)) obj.forEach((x) => walk(x, fn));
  else if (obj && typeof obj === "object") { fn(obj); Object.values(obj).forEach((v) => walk(v, fn)); }
}

// ---------------------------------------------------------------- parser
const parserCases: [string, string][] = [
  ["A & B -> C", "(A ∧ B) → C"],
  ["~(A v B)", "¬(A ∨ B)"],
  ["(A -> B) -> (~B -> ~A)", "(A → B) → (¬B → ¬A)"],
  ["@x(F(x) -> G(x))", "∀x(F(x) → G(x))"],
  ["3x(F(x) & ~x=a)", "∃x(F(x) ∧ ¬x = a)"],
  ["\\forall x\\,(\\lnot F(x) \\lor G(x,a))", "∀x(¬F(x) ∨ G(x,a))"],
  ["[]A -> A", "□A → A"],
  ["A_1 \\land A_{23}", "A₁ ∧ A₂₃"],
  ["P1 <-> P2", "P₁ ↔ P₂"],
];
for (const [src, want] of parserCases) {
  try {
    const got = toUnicode(parseFormula(src));
    if (got === want) pass++; else { fail++; failures.push(`parser: ${src} => ${got}, want ${want}`); }
  } catch (e) { fail++; failures.push(`parser: ${src} threw ${(e as Error).message}`); }
}
try { parseFormula("A B"); fail++; failures.push("parser: 'A B' should fail"); } catch { pass++; }
try { parseFormula("(A ∧ B ∨ C)"); fail++; failures.push("parser: mixing should fail"); } catch { pass++; }
try { parseFormula("(A ∧ B) ∨ C", { strict: true }); pass++; } catch (e) { fail++; failures.push("strict parse failed: " + (e as Error).message); }
try { parseFormula("A ∧ B ∨ C", { strict: true }); fail++; failures.push("strict: 'A ∧ B ∨ C' should fail"); } catch { pass++; }

// ---------------------------------------------------------------- proofs
const chapters = fs.readdirSync(BUILD).filter((f) => f.endsWith(".json")).sort();
let proofsChecked = 0;
for (const file of chapters) {
  const ch = JSON.parse(fs.readFileSync(path.join(BUILD, file), "utf8"));
  const proofs: any[] = [];
  walk(ch.blocks, (n) => { if (n.type === "fitch") proofs.push(n); });
  for (const part of ch.exercises) {
    const instr = JSON.stringify(part.blocks[0] ?? "");
    if (/incorrect|mistake|fallacious/i.test(instr)) continue;
    walk(part, (n) => { if (n.type === "fitch") proofs.push(n); });
  }
  for (const p of proofs) {
    const lines = p.lines as any[];
    // filter: complete, concrete proofs only
    const bad = lines.some((l) => /mathcal|vdots|ldots/.test(l.formula) || l.ellipsis || !/^\d+$/.test(l.num) ||
      /naughty|incorrect|attempt|invoke/i.test(l.ruleText ?? ""));
    const numsOk = lines.every((l, i) => +l.num === i + 1);
    for (const l of lines) if (!l.ruleText && l.hypo) l.ruleText = l.depth === 0 ? "PR" : "AS";
    const hasRules = lines.every((l) => l.ruleText);
    if (bad || !numsOk || !hasRules || lines.length < 2) { skipped++; continue; }
    if (lines[0].depth === 0 && lines[0].ruleText === "AS") { skipped++; continue; }
    const input: InputLine[] = lines.map((l) => ({
      formula: l.formula.replace(/\\Box\s*$/, "□").trim() === "\\Box" ? "□" : l.formula,
      rule: l.ruleText, refs: l.refs ?? "", depth: l.depth,
    }));
    for (const l of input) if (l.formula.trim() === "\\Box") l.formula = "□";
    const res = checkProof(input);
    proofsChecked++;
    if (res.complete || res.lines.every((r) => r.ok)) pass++;
    else {
      fail++;
      const errs = res.lines.map((r, i) => (r.ok ? null : `  line ${i + 1}: ${input[i].formula} [${input[i].rule} ${input[i].refs}] -> ${r.error}`)).filter(Boolean);
      failures.push(`proof in ${file}:\n${errs.join("\n")}`);
    }
  }
}

// ----------------------------------------------------------- truth tables
let ttChecked = 0;
for (const file of chapters) {
  const ch = JSON.parse(fs.readFileSync(path.join(BUILD, file), "utf8"));
  const tables: any[] = [];
  walk(ch, (n) => { if (n.type === "table" && n.truthTable) tables.push(n); });
  for (const t of tables) {
    const cols = t.cols as any[];
    const div = cols.findIndex((c, i) => i > 0 && c.borderLeft);
    if (div < 1) continue;
    const header = t.rows[0].cells.map((c: any) => cellText(c.children));
    const letters = header.slice(0, div);
    if (!letters.every((l: string) => /^[A-Z]\d*$/.test(l))) continue;
    // only tables with exactly one formula after the divider (no further dividers)
    if (cols.slice(div + 1).some((c) => c.borderLeft)) continue;
    const formulaText = header.slice(div).join(" ");
    let f;
    try { f = parseFormula(formulaText); } catch { continue; }
    if (!isTFL(f)) continue;
    const toks = displayTokens(f);
    const valueToks = toks.filter((x) => x.sub !== null);
    const body = t.rows.slice(1);
    const tt = truthTable(f, letters);
    if (body.length !== tt.rows.length) { skipped++; continue; }
    ttChecked++;
    let ok = true;
    const cellsAfter = (row: any) => row.cells.slice(div).map((c: any) => cellText(c.children));
    const headerCells = header.slice(div);
    // map each header cell to the display token(s) it covers, by position: book header cells correspond to symbols
    if (headerCells.length !== toks.length) {
      // header split differs from our tokenization (brackets glued differently); compare only the main column
      for (let r = 0; r < body.length; r++) {
        const vals = cellsAfter(body[r]);
        const main = vals.find((v: string) => /^\*?[TF]\*?$/.test(v) && body[r].cells.slice(div)[vals.indexOf(v)].children.some((x: any) => x.type === "strong"));
        if (main) {
          const want = tt.rows[r].values[0] ? "T" : "F";
          if (main.replace(/\*/g, "") !== want) ok = false;
        }
      }
    } else {
      for (let r = 0; r < body.length; r++) {
        const vals = cellsAfter(body[r]);
        for (let c = 0; c < toks.length; c++) {
          const tok = toks[c];
          if (tok.sub === null) continue;
          const want = tt.rows[r].values[tok.sub] ? "T" : "F";
          const got = (vals[c] ?? "").replace(/\*/g, "");
          if (got && got !== want) ok = false;
        }
      }
    }
    void valueToks;
    if (ok) pass++; else { fail++; failures.push(`truth table in ${file}: ${formulaText}`); }
  }
}

function cellText(inl: any[]): string {
  return inl.map((x) => x.type === "text" ? x.text : x.type === "math" ? x.latex : x.type === "strong" ? "*" + cellText(x.children) + "*" : "").join("").trim();
}

// ------------------------------------------------------- symbolization check
// Every TFL symbolization solution should be truth-functionally equivalent to itself (sanity) and parse.
let symb = 0;
for (const file of chapters) {
  const ch = JSON.parse(fs.readFileSync(path.join(BUILD, file), "utf8"));
  for (const part of ch.exercises) {
    if (part.kind !== "symbolize") continue;
    for (const it of part.items) {
      const sol = it.solution;
      if (!sol) continue;
      const maths: string[] = [];
      walk(sol, (n) => { if (n.type === "math") maths.push(n.latex); });
      if (!maths.length) continue;
      try {
        const f = parseFormula(maths[0]);
        symb++;
        if (part.logic === "tfl" && isTFL(f) && !equivalent(f, f)) throw new Error("self-equivalence");
        if (part.logic === "fol" && isSentence(f)) sampleEquivalent(f, f, 50);
        pass++;
      } catch (e) {
        fail++;
        failures.push(`symbolization solution ${it.id}: ${maths[0]} -> ${(e as Error).message}`);
      }
    }
  }
}

// --------------------------------------------------------- argument parsing
let args = 0;
for (const file of chapters) {
  const ch = JSON.parse(fs.readFileSync(path.join(BUILD, file), "utf8"));
  for (const part of ch.exercises) {
    if (part.kind !== "proof") continue;
    for (const it of part.items) {
      for (const s of it.formulas) {
        if (!/[∴⊢]/.test(s)) continue;
        try { parseArgument(s); args++; pass++; } catch (e) { fail++; failures.push(`argument ${it.id}: ${s} -> ${(e as Error).message}`); }
      }
    }
  }
}


// ---------------------------------------------------------------- typing shortcuts
const shortcutCases: [string, "tfl" | "fol" | "ml", boolean, string][] = [
  ["A ->", "tfl", false, "A →"],
  ["A <->", "tfl", false, "A ↔"],
  ["A <>", "tfl", false, "A ↔"],
  ["A <>", "ml", false, "A ◇"],
  ["[]", "ml", false, "□"],
  ["[]", "tfl", false, "[]"],
  ["A /\\", "tfl", false, "A ∧"],
  ["A \\/", "tfl", false, "A ∨"],
  ["A &", "tfl", false, "A ∧"],
  ["~", "tfl", false, "¬"],
  ["A v ", "tfl", false, "A ∨ "],
  ["Av ", "tfl", false, "Av "],
  ["_|_", "tfl", false, "⊥"],
  ["A |-", "tfl", false, "A ⊢"],
  ["A :.", "tfl", false, "A ∴"],
  ["A -", "tfl", false, "A -"],
  ["Ax", "fol", false, "∀x"],
  ["(Ex", "fol", false, "(∃x"],
  ["Ax", "tfl", false, "Ax"],
  ["Bx", "fol", false, "Bx"],
  ["@x", "fol", false, "∀x"],
  ["3x", "fol", false, "∃x"],
  ["A3", "fol", false, "A3"],
  ["\\neg ", "tfl", false, "¬"],
  ["\\forall(", "fol", false, "∀("],
  ["\\foo ", "tfl", false, "\\foo "],
  ["Smith & Jones", "fol", true, "Smith & Jones"],
  ["so A ->", "fol", true, "so A →"],
  ["Ax", "fol", true, "Ax"],
  // v next to = or ( is a variable; @ and 3 only start a word; 3x is left alone in prose
  ["x = v ", "fol", false, "x = v "],
  ["(v ", "fol", false, "(v "],
  ["R(a, v ", "fol", false, "R(a, v "],
  ["F(a) v ", "fol", false, "F(a) ∨ "],
  ["joe@y", "tfl", true, "joe@y"],
  ["it is 3x", "tfl", true, "it is 3x"],
];
for (const [input, logic, prose, want] of shortcutCases) {
  const got = applyShortcuts(input, input.length, logic, prose).text;
  if (got === want) pass++; else { fail++; failures.push(`shortcut ${JSON.stringify(input)} (${logic}${prose ? ", prose" : ""}): got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}
// caret lands after the replacement, text after the caret is untouched
{
  const r = applyShortcuts("A -> B", 4, "tfl");
  if (r.text === "A → B" && r.caret === 3) pass++; else { fail++; failures.push(`shortcut caret: ${JSON.stringify(r)}`); }
}


// ---------------------------------------------------------------- engine: must-reject / must-pass
// The replay above only shows that correct proofs pass. These check that wrong ones fail.
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else { fail++; failures.push(`${name}${detail ? ": " + detail : ""}`); } };
const P = (src: string) => src.trim().split("\n").map((l): InputLine => {
  const [d, f, r, refs] = l.split("|").map((x) => x.trim());
  return { depth: +d, formula: f, rule: r ?? "", refs: refs ?? "" };
});
const errs = (r: ReturnType<typeof checkProof>) => r.lines.map((x, i) => (x.ok ? "" : `L${i + 1} ${x.error}`)).filter(Boolean).join("; ");

// the book's 15 deliberately wrong proofs ("naughty attempt to invoke ...", "incorrect use of ..."): each marked line must fail
{
  let n = 0;
  for (const file of chapters) {
    const ch = JSON.parse(fs.readFileSync(path.join(BUILD, file), "utf8"));
    const proofs: any[] = [];
    walk(ch.blocks, (x) => { if (x.type === "fitch") proofs.push(x); });
    for (const part of ch.exercises) walk(part, (x) => { if (x.type === "fitch") proofs.push(x); });
    for (const pf of proofs) {
      const lines = pf.lines as any[];
      const wrong = lines.map((l, i) => (/naught?y|incorrect|attempt|invoke/i.test(l.ruleText ?? "") ? i : -1)).filter((i) => i >= 0);
      if (!wrong.length) continue;
      const input: InputLine[] = lines.map((l) => ({
        formula: String(l.formula).trim() === "\\Box" ? "□" : String(l.formula).replace(/\\mathcal\{([A-Z])\}/g, "$1"),
        rule: String(l.ruleText ?? (l.hypo ? (l.depth === 0 ? "PR" : "AS") : "")).replace(/^.*?(invoke|use of)\s*/i, "").trim(),
        refs: l.refs ?? "", depth: l.depth,
      }));
      const res = checkProof(input, { modal: /Box/.test(JSON.stringify(lines)) });
      for (const i of wrong) { n++; check(`book's wrong proof in ${file}, line ${i + 1} (${lines[i].ruleText}) must fail`, !res.lines[i].ok); }
    }
  }
  check("found the book's 15 wrong proof steps", n === 15, `found ${n}`);
}

// PR lines must be the exercise's premises (order and repetition are fine)
{
  const prem = (fs_: string[]) => fs_.map((f) => parseFormula(f));
  let r = checkProof(P(`
0 | A | PR
0 | B | PR`), { premises: prem(["A"]) });
  check("extra premise equal to the goal must fail", !r.lines[1].ok && !r.complete, errs(r));
  r = checkProof(P(`0 | A ∨ ¬A | PR`), { premises: [] });
  check("PR in an exercise without premises must fail", !r.complete);
  r = checkProof(P(`
0 | A | PR
0 | A → B | PR
0 | A | PR
0 | B | →E | 2, 3`), { premises: prem(["A → B", "A"]) });
  check("premises in another order, one repeated, pass", r.complete, errs(r));
}

// rule sets: modal system, chapter, part restrictions
{
  const ml = (sys: string, part?: string) => { const rs = ruleSet({ logic: "ml", system: sys, chapterId: "ch43", part }); return { allowed: rs.allowed, disallowed: rs.message, modal: true }; };
  let r = checkProof(P(`
0 | □A | PR
0 | A | RT | 1`), ml("K"));
  check("RT in system K must fail, naming the system", !r.complete && /system K/.test(r.lines[1].error ?? ""), errs(r));
  r = checkProof(P(`
0 | □A | PR
0 | A | RT | 1`), ml("T"));
  check("RT in system T passes", r.complete, errs(r));
  r = checkProof(P(`
0 | ¬□A | PR
1 | □ |
1 | ¬□A | R5 | 1
0 | □¬□A | □I | 2-3`), ml("S4"));
  check("R5 in system S4 must fail", !r.complete);
  r = checkProof(P(`
0 | ¬□A | PR
0 | ◇¬A | MC | 1`), ml("K", "B"));
  check("MC in ch43 B (without Modal Conversion) must fail", !r.complete);
  r = checkProof(P(`
0 | ¬□A | PR
0 | ◇¬A | MC | 1`), ml("K", "C"));
  check("MC in ch43 C passes", r.complete, errs(r));
  const b17 = ruleSet({ logic: "tfl", chapterId: "ch17" });
  r = checkProof(P(`
0 | A ∨ B | PR
0 | ¬A | PR
0 | B | DS | 1, 2`), { allowed: b17.allowed, disallowed: b17.message });
  check("DS in a chapter 17 exercise (basic rules only) must fail", !r.complete);
}

// strict subproofs side by side are fine
{
  let r = checkProof(P(`
0 | □(A ∧ B) | PR
1 | □ |
1 | A ∧ B | □E | 1
1 | A | ∧E | 3
1 | □ |
1 | A ∧ B | □E | 1
1 | B | ∧E | 6
0 | □A | □I | 2-4
0 | □B | □I | 5-7
0 | □A ∧ □B | ∧I | 8, 9`), { modal: true });
  check("adjacent strict subproofs pass", r.complete, errs(r));
  r = checkProof(P(`
1 | A | AS
1 | A | R | 1
1 | □ |
2 | B | AS
2 | B | R | 4
1 | B → B | →I | 4-5
0 | A → A | →I | 1-2
0 | □(B → B) | □I | 3-6`), { modal: true });
  check("strict subproof right after an ordinary one at the same depth passes", r.lines.every((x) => x.ok), errs(r));
  r = checkProof(P(`
0 | A | PR
1 | □ |
1 | A | R | 1
0 | □A | □I | 2-3`), { modal: true });
  check("R across a strict boundary still fails", !r.complete);
}

// FOL equivalence: the ch28.B.7 readings differ (needs five objects); exact monadic check
{
  const d4 = "¬w = x ∧ ¬w = y ∧ ¬w = z ∧ ¬x = y ∧ ¬x = z ∧ ¬y = z";
  const atLeast4 = parseFormula(`∃w∃x∃y∃z(${d4} ∧ D(w) ∧ D(x) ∧ D(y) ∧ D(z))`);
  const exactly4 = parseFormula(`∃w∃x∃y∃z(${d4} ∧ D(w) ∧ D(x) ∧ D(y) ∧ D(z) ∧ ∀u(D(u) → (u = w ∨ u = x ∨ u = y ∨ u = z)))`);
  check("ch28.B.7: 'at least four' and 'exactly four' are told apart", !sampleEquivalent(atLeast4, exactly4).equivalent);
  check("at most four things is not a validity", !sampleEquivalent(parseFormula("∀s∀t∀u∀w∀z(s = t ∨ s = u ∨ s = w ∨ s = z ∨ t = u ∨ t = w ∨ t = z ∨ u = w ∨ u = z ∨ w = z)"), parseFormula("∀x x = x")).equivalent);
  check("monadic exact: ∀x(F(x) ∧ G(x)) ≡ ∀xF(x) ∧ ∀xG(x)", monadicEquivalent(parseFormula("∀x(F(x) ∧ G(x))"), parseFormula("∀x F(x) ∧ ∀x G(x)"))?.equivalent === true);
  check("monadic exact: ∀x(F(x) → G(x)) ≢ ∀xF(x) → ∀xG(x)", monadicEquivalent(parseFormula("∀x(F(x) → G(x))"), parseFormula("∀x F(x) → ∀x G(x)"))?.equivalent === false);
  check("monadic exact declines identity", monadicEquivalent(atLeast4, exactly4) === null);
}

// parser: v, ≠, brackets, ASCII quantifiers
{
  const throws = (s: string, o = {}) => { try { parseFormula(s, o); return false; } catch { return true; } };
  const reads = (s: string, want: string, o = {}) => { try { return toUnicode(parseFormula(s, o)) === want; } catch { return false; } };
  check("AvB is an error outside TFL (not ∀v B)", throws("AvB"));
  check("AvB in TFL is A ∨ B", reads("AvB", "A ∨ B", { logic: "tfl" }));
  check("Ax(F(x) → G(x)) still reads as ∀x", reads("Ax(F(x) -> G(x))", "∀x(F(x) → G(x))"));
  check("∀v(v = a) round-trips", reads(toUnicode(parseFormula("∀v(v = a)")), "∀v v = a"));
  check("x = v ∨ v = a parses", reads("∀v∀x(x = v ∨ v = a)", "∀v∀x(x = v ∨ v = a)"));
  check("a ≠ b reads as ¬a = b", reads("a ≠ b", "¬a = b") && reads("a \\neq b", "¬a = b"));
  check("(A ∧ B] is rejected", throws("(A ∧ B]"));
  check("F(a] is rejected", throws("F(a]"));
  check("unbalanced { is rejected", throws("A ∧ {B"));
  check("[A ∧ B] → C still parses", reads("[A ∧ B] → C", "(A ∧ B) → C"));
}

// every proof exercise asks for the right thing: premises/conclusion parse, TFL ones are valid,
// FOL ones have no countermodel except the book's "valid or not?" items, and the book's own
// solutions use only rules the exercise allows
{
  const expectInvalid = new Set(["ch36.H.1", "ch36.H.2", "ch36.H.4", "ch36.H.5", "ch36.I.2", "ch36.I.3", "ch36.I.6", "ch36.I.8", "ch36.I.9"]);
  const invalid: string[] = [];
  const txt = (n: any): string => Array.isArray(n) ? n.map(txt).join("") : n && typeof n === "object" ? (n.type === "text" ? n.text : n.type === "math" ? n.latex : Object.values(n).map(txt).join("")) : "";
  let items = 0;
  for (const file of chapters) {
    const ch = JSON.parse(fs.readFileSync(path.join(BUILD, file), "utf8"));
    for (const part of ch.exercises) {
      if (part.kind !== "proof") continue;
      const para = part.blocks.find((b: any) => b.type === "para");
      const instr = para ? txt(para.children).toLowerCase() : "";
      for (const it of part.items) {
        items++;
        const specs = proofSpecs(it.formulas ?? [], instr);
        if (!specs.length) { check(`proof item ${it.id} has a spec`, false); continue; }
        const used = new Set<string>();
        walk(it.solution, (x) => { if (x.type === "fitch") for (const l of x.lines) { const r = normalizeRule(String(l.ruleText ?? "").split(/\s/)[0]); if (r && r !== "PR" && r !== "AS") used.add(r); } });
        for (const s of specs) {
          try {
            const ps = s.premises.map((q) => parseFormula(q, { logic: part.logic }));
            const c = parseFormula(s.conclusion, { logic: part.logic });
            const all = [...ps, c];
            if (all.every(isTFL) ? counterexample(ps, c) : part.logic === "fol" && all.every(isFOL) && sampleCounterexample(ps, c)) invalid.push(it.id);
            const rs = ruleSet({ logic: part.logic, system: s.system, chapterId: ch.id, part: part.letter });
            const bad = [...used].filter((r) => !rs.allowed.has(r));
            check(`book solution of ${it.id} uses only allowed rules`, !bad.length, bad.join(" "));
            pass++;
          } catch (e) { check(`proof item ${it.id} spec parses`, false, `${JSON.stringify(s)}: ${(e as Error).message}`); }
        }
      }
    }
  }
  const unexpected = invalid.filter((id) => !expectInvalid.has(id));
  check("no proof exercise asks for an invalid argument (besides the book's valid-or-not items)", !unexpected.length && [...expectInvalid].every((id) => invalid.includes(id)), `unexpected ${unexpected.join(", ")}; got ${[...new Set(invalid)].join(", ")}`);
  check("proof items found", items > 100, String(items));
}
void fEq;

// ---------------------------------------------------------------- progress merge
{
  const base = (): Progress => ({ read: {}, visited: {}, exercises: {}, notes: {}, bookmarks: [], flash: {} });
  const L = base(), R = base();
  L.exercises["a"] = { status: "attempted", answer: "old", updated: 100 };
  R.exercises["a"] = { status: "correct", answer: "new", updated: 200 };
  L.exercises["b"] = { status: "done", updated: 300 };
  R.exercises["c"] = { status: "revealed", updated: 50 };
  L.read["ch01"] = 10; R.read["ch01"] = 20; R.read["ch02"] = 5;
  L.visited["ch01"] = 10; R.visited["ch03"] = 900; R.last = { chapter: "ch03" }; L.last = { chapter: "ch01" };
  L.flash["x"] = { box: 1, due: 1000 }; R.flash["x"] = { box: 2, due: 2000 };
  L.theme = "dark"; R.theme = "light";
  const m = mergeProgress(L, R);
  const checks: [string, boolean][] = [
    ["newer exercise wins", m.exercises["a"].answer === "new" && m.exercises["a"].status === "correct"],
    ["local-only kept", m.exercises["b"]?.status === "done"],
    ["remote-only kept", m.exercises["c"]?.status === "revealed"],
    ["read max", m.read["ch01"] === 20 && m.read["ch02"] === 5],
    ["last from most recently visited side", m.last?.chapter === "ch03"],
    ["flash later due wins", m.flash["x"].box === 2],
    ["theme stays local", m.theme === "dark"],
  ];
  // a reset on one side removes older records from the other
  const L2 = base(); L2.clearedAt = 250;
  const m2 = mergeProgress(L2, R);
  checks.push(["reset drops older remote records", !m2.exercises["a"] && !m2.exercises["c"] && m2.clearedAt === 250]);
  const R3 = base(); R3.clearedAt = 250; R3.exercises["z"] = { status: "done", updated: 260 };
  const m3 = mergeProgress(L, R3);
  checks.push(["remote reset drops older local, keeps newer", !m3.exercises["a"] && m3.exercises["b"]?.status === "done" && m3.exercises["z"]?.status === "done"]);
  checks.push(["merge is idempotent", JSON.stringify(mergeProgress(m, m)) === JSON.stringify(m)]);
  for (const [name, ok] of checks) { if (ok) pass++; else { fail++; failures.push(`merge: ${name}`); } }
}

// ---------------------------------------------------------------- sessions and sign-in helpers
{
  const checks: [string, boolean][] = [];
  const secret = "test-secret-test-secret-test-secret-0123";
  const uid = "0123456789abcdef01234567";
  const now = 1_800_000_000_000;
  const tok = signSession(uid, secret, now);
  checks.push(["session round-trips", verifySession(tok, secret, now + 1000) === uid]);
  checks.push(["session expires", verifySession(tok, secret, now + 181 * 86400_000) === null]);
  checks.push(["wrong secret rejected", verifySession(tok, "other-secret-other-secret-other-secret", now) === null]);
  checks.push(["tampered uid rejected", verifySession(tok.replace(uid, "ffffffffffffffffffffffff"), secret, now) === null]);
  checks.push(["tampered exp rejected", verifySession(tok.replace(String(now + 180 * 86400_000), String(now + 365 * 86400_000)), secret, now) === null]);
  checks.push(["garbage rejected", verifySession("v1.x.y", secret, now) === null && verifySession("", secret) === null && verifySession(null, secret) === null]);
  const c = parseCookies(`a=1; ${COOKIE}=${tok}; b=x%20y`);
  checks.push(["cookie parsed", c[COOKIE] === tok && c.a === "1" && c.b === "x y"]);
  checks.push(["cookie header shape", /HttpOnly/.test(sessionCookie(tok)) && /Secure/.test(sessionCookie(tok)) && /SameSite=Lax/.test(sessionCookie(tok))]);
  checks.push(["email normalized", normalizeEmail("  Someone@Example.ORG ") === "someone@example.org"]);
  checks.push(["bad emails rejected", normalizeEmail("nope") === null && normalizeEmail("a@b") === null && normalizeEmail(42) === null]);
  checks.push(["malformed cookie escape does not throw", parseCookies(`x=%E0%A4%A; ${COOKIE}=${tok}`)[COOKIE] === tok]);
  const req = (h: Record<string, string>) => new Request("https://forallxworkbook.com/api/auth/verify", { method: "POST", headers: h });
  checks.push(["same-origin browser request allowed", !crossSite(req({ host: "forallxworkbook.com", origin: "https://forallxworkbook.com", "sec-fetch-site": "same-origin" }))]);
  checks.push(["non-browser request allowed", !crossSite(req({ host: "forallxworkbook.com" }))]);
  checks.push(["foreign origin refused", crossSite(req({ host: "forallxworkbook.com", origin: "https://evil.example" }))]);
  checks.push(["cross-site fetch refused", crossSite(req({ host: "forallxworkbook.com", "sec-fetch-site": "cross-site" })) && crossSite(req({ host: "forallxworkbook.com", "sec-fetch-site": "same-site" }))]);
  checks.push(["opaque origin refused", crossSite(req({ host: "forallxworkbook.com", origin: "null" }))]);
  checks.push(["IPv4 bucket is the address", clientBucket(req({ "x-real-ip": "203.0.113.9" })) === "203.0.113.9" && clientBucket(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })) === "203.0.113.9"]);
  checks.push(["IPv6 bucket is the /64", clientBucket(req({ "x-real-ip": "2001:db8:0:1:aaaa::1" })) === "2001:db8:0:1::/64" && clientBucket(req({ "x-real-ip": "2001:DB8:0:1:bbbb:cccc:dddd:eeee" })) === "2001:db8:0:1::/64" && clientBucket(req({ "x-real-ip": "2001:db8::5" })) === "2001:db8:0:0::/64"]);
  checks.push(["missing address has a bucket", clientBucket(req({})) === "unknown"]);
  // signing in with a sync code: code blob, local, account blob all merge without loss
  const base = (): Progress => ({ read: {}, visited: {}, exercises: {}, notes: {}, bookmarks: [], flash: {} });
  const codeBlob = base(); codeBlob.exercises["c1"] = { status: "done", updated: 100 };
  const local = base(); local.exercises["l1"] = { status: "attempted", updated: 200 };
  const account = base(); account.exercises["a1"] = { status: "correct", updated: 300 }; account.exercises["l1"] = { status: "done", updated: 250 };
  const afterCode = mergeProgress(local, codeBlob);
  const afterAccount = mergeProgress(afterCode, account);
  checks.push(["sign-in migration keeps code, local and account records", afterAccount.exercises["c1"]?.status === "done" && afterAccount.exercises["a1"]?.status === "correct" && afterAccount.exercises["l1"]?.status === "done"]);
  for (const [name, ok] of checks) { if (ok) pass++; else { fail++; failures.push(`auth: ${name}`); } }
}

console.log(`proofs checked: ${proofsChecked}, truth tables checked: ${ttChecked}, symbolization solutions: ${symb}, arguments: ${args}`);
console.log(`pass ${pass}, fail ${fail}, skipped ${skipped}`);
for (const f of failures.slice(0, 80)) console.log("FAIL", f);
if (fail) process.exit(1);
