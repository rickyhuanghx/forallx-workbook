// What a proof exercise asks for, worked out from the item's formula strings and the part's instruction.
//
// The converter emits an item's formulas as one or more strings. An argument may be spread over
// several strings ("E ∨ F", "F ∨ G", "¬F ∴ E ∧ G"), and a pair or set of sentences may come as one
// comma-joined string ("¬(C → D), C ∧ ¬D"), so strings are joined or split on top-level commas first.

export interface ProofSpec {
  premises: string[];          // logic strings
  conclusion: string;
  system?: string;             // K, T, S4, S5 for modal exercises
}

export function proofSpecs(formulas: string[], instr: string): ProofSpec[] {
  const strs = formulas.map((f) => f.trim()).filter(Boolean);
  if (strs.some((f) => /[∴⊢]/.test(f))) {
    const m = strs.join(", ").match(/^(.*?)\s*[∴⊢]\s*(?:_\s*\{?\\?(?:mathbf\{)?([A-Za-z0-9]+)\}?\}?\s*)?(.*)$/);
    if (!m) return [];
    return [{ premises: splitTop(m[1]), conclusion: m[3].trim().replace(/,$/, "").trim(), system: m[2] }];
  }
  const parts = strs.flatMap(splitTop);
  if (!parts.length) return [];
  if (/interderivable|provably equivalent|equivalent/.test(instr) && parts.length >= 2) {
    return [{ premises: [parts[0]], conclusion: parts[1] }, { premises: [parts[1]], conclusion: parts[0] }];
  }
  if (/contrary|inconsistent/.test(instr)) return [{ premises: parts, conclusion: "⊥" }];
  if (/theorem/.test(instr) || parts.length === 1) return parts.map((p) => ({ premises: [], conclusion: p }));
  return [];
}

/** Split "A, B ∧ C, D" on top-level commas (commas inside predicate arguments are kept); drops empty pieces. */
export function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
