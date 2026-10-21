import type { Formula, Term } from "./ast";
import { isBinary } from "./ast";

const UNI: Record<string, string> = { not: "¬", and: "∧", or: "∨", imp: "→", iff: "↔", forall: "∀", exists: "∃", box: "□", dia: "◇", bot: "⊥" };
const TEX: Record<string, string> = { not: "\\lnot ", and: " \\land ", or: " \\lor ", imp: " \\rightarrow ", iff: " \\leftrightarrow ", forall: "\\forall ", exists: "\\exists ", box: "\\Box ", dia: "\\Diamond ", bot: "\\bot" };

function termU(t: Term): string {
  return subU(t.name);
}
function subU(n: string): string {
  const m = n.match(/^([A-Za-z])(\d+)$/);
  if (!m) return n;
  const digits = "₀₁₂₃₄₅₆₇₈₉";
  return m[1] + [...m[2]].map((d) => digits[+d]).join("");
}
function termT(t: Term): string {
  const m = t.name.match(/^([A-Za-z])(\d+)$/);
  return m ? `${m[1]}_{${m[2]}}` : t.name;
}
function predT(n: string): string {
  const m = n.match(/^([A-Z])(\d+)$/);
  return m ? `${m[1]}_{${m[2]}}` : n;
}

/** Unicode rendering with the book's bracketing (outermost brackets dropped). */
export function toUnicode(f: Formula, outer = true): string {
  switch (f.kind) {
    case "atom":
      return f.args.length ? `${subU(f.pred)}(${f.args.map(termU).join(",")})` : subU(f.pred);
    case "eq":
      return `${termU(f.left)} = ${termU(f.right)}`;
    case "bot":
      return "⊥";
    case "not":
    case "box":
    case "dia":
      return UNI[f.kind] + toUnicode(f.sub, false);
    case "forall":
    case "exists":
      return UNI[f.kind] + subU(f.v) + (f.sub.kind === "atom" || f.sub.kind === "eq" ? " " : "") + toUnicode(f.sub, false);
    default: {
      const s = `${toUnicode(f.left, false)} ${UNI[f.kind]} ${toUnicode(f.right, false)}`;
      return outer ? s : `(${s})`;
    }
  }
}

/** LaTeX for KaTeX, same bracketing. */
export function toLatex(f: Formula, outer = true): string {
  switch (f.kind) {
    case "atom":
      return f.args.length ? `${predT(f.pred)}(${f.args.map(termT).join(",")})` : predT(f.pred);
    case "eq":
      return `${termT(f.left)} = ${termT(f.right)}`;
    case "bot":
      return "\\bot";
    case "not":
    case "box":
    case "dia":
      return TEX[f.kind] + toLatex(f.sub, false);
    case "forall":
    case "exists":
      return TEX[f.kind] + termT({ kind: "var", name: f.v }) + "\\," + toLatex(f.sub, false);
    default: {
      const s = `${toLatex(f.left, false)}${TEX[f.kind]}${toLatex(f.right, false)}`;
      return outer ? s : `(${s})`;
    }
  }
}

/** Does the formula carry brackets exactly as the book would write it? Compare strings. */
export function sameWriting(a: Formula, b: Formula): boolean {
  return toUnicode(a) === toUnicode(b);
}

/**
 * Flat display tokens for a truth-table header: one entry per symbol, in reading order,
 * with the index of the subformula (in `subformulas` order) whose value sits under it.
 */
export interface DisplayTok {
  text: string;      // unicode text
  latex: string;
  sub: number | null;   // index of the subformula whose truth value goes under this symbol
  main?: boolean;
}

export function displayTokens(f: Formula): DisplayTok[] {
  const out: DisplayTok[] = [];
  let counter = 0;
  const walk = (g: Formula, outer: boolean, isMain: boolean) => {
    const idx = counter++;
    switch (g.kind) {
      case "atom":
      case "eq":
      case "bot":
        out.push({ text: toUnicode(g), latex: toLatex(g), sub: idx, main: isMain });
        return;
      case "not":
      case "box":
      case "dia":
        out.push({ text: UNI[g.kind], latex: TEX[g.kind].trim(), sub: idx, main: isMain });
        walk(g.sub, false, false);
        return;
      case "forall":
      case "exists":
        out.push({ text: UNI[g.kind] + subU(g.v), latex: TEX[g.kind] + termT({ kind: "var", name: g.v }), sub: idx, main: isMain });
        walk(g.sub, false, false);
        return;
      default: {
        if (!outer) out.push({ text: "(", latex: "(", sub: null });
        walk(g.left, false, false);
        out.push({ text: UNI[g.kind], latex: TEX[g.kind].trim(), sub: idx, main: isMain });
        walk(g.right, false, false);
        if (!outer) out.push({ text: ")", latex: ")", sub: null });
      }
    }
  };
  walk(f, true, isBinary(f) || f.kind === "not" || f.kind === "box" || f.kind === "dia" || f.kind === "forall" || f.kind === "exists");
  // merge brackets into neighbouring tokens for a tighter header, like the book
  const merged: DisplayTok[] = [];
  for (const t of out) {
    if (t.sub === null && t.text === "(" ) {
      merged.push({ ...t, text: "(", latex: "(" });
      continue;
    }
    if (t.sub === null && t.text === ")") {
      const last = merged[merged.length - 1];
      if (last) { last.text += ")"; last.latex += ")"; continue; }
    }
    const last = merged[merged.length - 1];
    if (last && last.sub === null && last.text.endsWith("(")) {
      merged.pop();
      merged.push({ ...t, text: last.text + t.text, latex: last.latex + t.latex });
      continue;
    }
    merged.push(t);
  }
  return merged;
}
