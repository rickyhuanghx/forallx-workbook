// Live typing shortcuts: rewrite the book's ASCII forms into logic symbols as they are typed.
// Only the few characters just before the caret are inspected, so pasted text is left alone
// (the parser still accepts every ASCII form on Check).

export type ShortLogic = "tfl" | "fol" | "ml";

export interface ShortcutResult { text: string; caret: number }

interface Rule {
  re: RegExp;                      // matched against the text before the caret; must end with $
  to: string | ((m: RegExpMatchArray) => string);
  logic?: ShortLogic[];            // restrict to these logics
  prose?: boolean;                 // also apply in prose (written-answer) boxes
}

const WORDS: Record<string, string> = {
  lnot: "¬", neg: "¬", not: "¬", land: "∧", wedge: "∧", and: "∧", lor: "∨", vee: "∨", or: "∨",
  to: "→", rightarrow: "→", imp: "→", iff: "↔", leftrightarrow: "↔", bot: "⊥", forall: "∀", all: "∀",
  exists: "∃", ex: "∃", some: "∃", Box: "□", box: "□", Diamond: "◇", dia: "◇", therefore: "∴", vdash: "⊢", vDash: "⊨",
};

// Order matters: longer forms first, and forms that share a prefix before the prefix.
const RULES: Rule[] = [
  { re: /<->$/, to: "↔", prose: true },
  { re: /<→$/, to: "↔", prose: true },
  { re: /->$/, to: "→", prose: true },
  { re: /<>$/, to: "◇", logic: ["ml"] },
  { re: /<>$/, to: "↔", logic: ["tfl", "fol"] },
  { re: /\[\]$/, to: "□", logic: ["ml"], prose: true },
  { re: /\/\\$/, to: "∧", prose: true },
  { re: /\\\/$/, to: "∨", prose: true },
  { re: /_\|_$/, to: "⊥", prose: true },
  { re: /\|-$/, to: "⊢" },
  { re: /\|=$/, to: "⊨" },
  { re: /:\.$/, to: "∴" },
  { re: /~$/, to: "¬", prose: true },
  { re: /&$/, to: "∧" },
  { re: /\^$/, to: "∧" },
  { re: /#$/, to: "⊥" },
  // " v " as disjunction, fired by the space after the v
  { re: /(^|[\s(])v $/, to: (m) => `${m[1]}∨ `, prose: true },
  // quantifier letters, the book's own ASCII: Ax, Ey (only in FOL, and only when the A or E starts a word)
  { re: /(^|[^A-Za-z0-9_])([AE])([s-z])$/, to: (m) => `${m[1]}${m[2] === "A" ? "∀" : "∃"}${m[3]}`, logic: ["fol"] },
  { re: /@([s-z])$/, to: (m) => `∀${m[1]}`, prose: true },
  { re: /(^|[^A-Za-z0-9_])3([s-z])$/, to: (m) => `${m[1]}∃${m[2]}`, prose: true },
  // LaTeX-style names, converted when the following non-letter is typed
  { re: /\\([A-Za-z]+)([^A-Za-z])$/, to: (m) => (WORDS[m[1]] ? WORDS[m[1]] + (m[2] === " " ? "" : m[2]) : m[0]), prose: true },
];

export function applyShortcuts(text: string, caret: number, logic: ShortLogic = "tfl", prose = false): ShortcutResult {
  const pos = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, pos);
  for (const r of RULES) {
    if (r.logic && !r.logic.includes(logic)) continue;
    if (prose && !r.prose) continue;
    const m = before.match(r.re);
    if (!m) continue;
    const rep = typeof r.to === "string" ? r.to : r.to(m);
    if (rep === m[0]) continue;
    const head = before.slice(0, before.length - m[0].length) + rep;
    return { text: head + text.slice(pos), caret: head.length };
  }
  return { text, caret: pos };
}

/** Rows for the typing-help legend: [symbol, how to type it]. */
export function shortcutLegend(logic: ShortLogic): [string, string][] {
  const rows: [string, string][] = [
    ["¬", "~"],
    ["∧", "& or /\\"],
    ["∨", "\\/ or v between spaces"],
    ["→", "->"],
    ["↔", "<->"],
    ["⊥", "_|_ or #"],
  ];
  if (logic === "fol") rows.push(["∀x", "Ax or @x"], ["∃x", "Ex or 3x"], ["=", "typed as is"]);
  if (logic === "ml") rows.push(["□", "[]"], ["◇", "<>"]);
  rows.push(["∴", ":."], ["⊢", "|-"]);
  return rows;
}
