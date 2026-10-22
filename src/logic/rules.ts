// Which proof rules an exercise may use: the logic (TFL, FOL, ML), the modal system (K, T, S4, S5),
// and the point in the book the exercise sits at (derived rules from chapter 19, CQ from 38,
// identity from 39) or an explicit restriction in the part's instructions (ch43 B: no MC).
import type { Logic } from "./parser";

export const BASIC_TFL = ["R", "∧I", "∧E", "∨I", "∨E", "→I", "→E", "↔I", "↔E", "¬I", "¬E", "X", "IP"];
export const DERIVED_TFL = ["DNE", "MT", "DS", "LEM", "DeM"];
export const QUANTIFIER = ["∀I", "∀E", "∃I", "∃E"];
export const IDENTITY = ["=I", "=E"];
export const MODAL_K = ["□I", "□E", "MC", "Def◇"];
const SYSTEM_EXTRA: Record<string, string[]> = { K: [], T: ["RT"], S4: ["RT", "R4"], S5: ["RT", "R4", "R5"] };
const FIRST_SYSTEM: Record<string, string> = { RT: "T", R4: "S4", R5: "S5" };

export interface RuleSet {
  allowed: Set<string>;                  // PR and AS are always usable and are not listed
  message: (rule: string) => string;     // why a rule outside `allowed` cannot be used here
  note?: string;                         // a short line for the goal header, when something is held back
}

/** Normalize a system name as written after ⊢ ("K", "\mathbf{S4}", "s5") to K, T, S4 or S5. */
export function normalizeSystem(s?: string): string | undefined {
  if (!s) return undefined;
  const m = s.replace(/\\mathbf|[{}\\\s]/g, "").toUpperCase();
  return m in SYSTEM_EXTRA ? m : undefined;
}

export function ruleSet(o: { logic: Logic; system?: string; chapterId?: string; part?: string }): RuleSet {
  const ch = /^ch(\d+)$/.exec(o.chapterId ?? "")?.[1];
  const n = ch ? +ch : undefined;                         // undefined: the Lab, no chapter limits
  const from = (k: number) => n === undefined || n >= k;
  const why = new Map<string, string>();
  const allowed = new Set<string>(BASIC_TFL);
  const notes: string[] = [];

  for (const r of DERIVED_TFL) {
    if (from(19)) allowed.add(r);
    else why.set(r, `${r} is one of the additional rules of chapter 19. These exercises use only the basic rules of chapter 17`);
  }
  if (!from(19)) notes.push("Basic rules only (chapter 17).");

  if (o.logic === "fol") {
    for (const r of QUANTIFIER) allowed.add(r);
    if (from(38)) allowed.add("CQ"); else why.set("CQ", "CQ (conversion of quantifiers) is introduced in chapter 38");
    for (const r of IDENTITY) {
      if (from(39)) allowed.add(r); else why.set(r, `${r} is one of the identity rules of chapter 39`);
    }
  }

  if (o.logic === "ml") {
    const sys = normalizeSystem(o.system) ?? "S5";
    for (const r of MODAL_K) allowed.add(r);
    for (const r of SYSTEM_EXTRA[sys]) allowed.add(r);
    for (const r of ["RT", "R4", "R5"]) if (!allowed.has(r)) why.set(r, `${r} is not a rule of system ${sys}: it belongs to ${FIRST_SYSTEM[r]}${FIRST_SYSTEM[r] === "S5" ? "" : " and the stronger systems"}`);
    if (sys !== "S5") notes.push(`System ${sys}: ${sys === "K" ? "no RT, R4 or R5" : sys === "T" ? "RT, but no R4 or R5" : "RT and R4, but no R5"}.`);
    if (n === 43 && o.part === "B") {
      allowed.delete("MC");
      why.set("MC", "This exercise asks for proofs without Modal Conversion (MC). Use Def◇ and the other rules of K");
      notes.push("Without Modal Conversion (MC).");
    }
  }

  const message = (rule: string): string => {
    const w = why.get(rule);
    if (w) return w;
    if ([...QUANTIFIER, "CQ", ...IDENTITY].includes(rule)) return `${rule} is a rule for FOL proofs, and this is a ${o.logic === "ml" ? "modal" : "TFL"} proof`;
    if ([...MODAL_K, "RT", "R4", "R5"].includes(rule)) return `${rule} is a modal rule, and this is not a modal proof`;
    return `The rule ${rule} is not available in this exercise`;
  };
  return { allowed, message, note: notes.length ? notes.join(" ") : undefined };
}
