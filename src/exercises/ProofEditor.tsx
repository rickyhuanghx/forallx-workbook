import { useEffect, useMemo, useState } from "react";
import type { Block } from "../content/types";
import { eq } from "../logic/ast";
import { checkProof, RULES, type InputLine } from "../logic/nd";
import { tryParse } from "../logic/parser";
import { toLatex } from "../logic/print";
import { Math } from "../render/Math";
import { recordExercise, useProgress } from "../state/progress";
import { FormulaInput, Palette } from "./FormulaInput";
import { Solution, Verdict } from "./Solution";

export interface ProofSpec {
  premises: string[];          // logic strings
  conclusion: string;
  system?: string;             // K, T, S4, S5 for modal exercises
}

interface Props {
  exerciseId: string;
  spec: ProofSpec;
  logic: "tfl" | "fol" | "ml";
  solution?: Block[];
  chapterId?: string;
  title?: React.ReactNode;
  availableRules?: string[];   // restrict the rule menu (e.g. before derived rules are introduced)
  given?: EditLine[];          // "add the citations" exercises: formulas fixed, rules and refs to fill in
}

export interface EditLine { formula: string; rule: string; refs: string; depth: number; locked?: boolean; fixed?: boolean }

const RULE_GROUPS: { label: string; rules: string[]; logic: ("tfl" | "fol" | "ml")[] }[] = [
  { label: "Structure", rules: ["PR", "AS", "R"], logic: ["tfl", "fol", "ml"] },
  { label: "Basic TFL", rules: ["∧I", "∧E", "∨I", "∨E", "→I", "→E", "↔I", "↔E", "¬I", "¬E", "X", "IP"], logic: ["tfl", "fol", "ml"] },
  { label: "Derived TFL", rules: ["DNE", "MT", "DS", "LEM", "DeM"], logic: ["tfl", "fol", "ml"] },
  { label: "Quantifiers", rules: ["∀I", "∀E", "∃I", "∃E", "CQ"], logic: ["fol"] },
  { label: "Identity", rules: ["=I", "=E"], logic: ["fol"] },
  { label: "Modal", rules: ["□I", "□E", "MC", "Def◇", "RT", "R4", "R5"], logic: ["ml"] },
];

function initialLines(spec: ProofSpec): EditLine[] {
  const prem = spec.premises.map((p) => ({ formula: p, rule: "PR", refs: "", depth: 0, locked: true }));
  return prem.length ? [...prem, { formula: "", rule: "", refs: "", depth: 0 }] : [{ formula: "", rule: "AS", refs: "", depth: 1 }];
}

export function ProofEditor({ exerciseId, spec, logic, solution, chapterId, title, availableRules, given }: Props) {
  const [progress] = useProgress();
  const rec = progress.exercises[exerciseId];
  const saved = rec?.proof as EditLine[] | undefined;
  const fresh = () => (given ? given.map((l) => ({ ...l })) : initialLines(spec));
  const [lines, setLines] = useState<EditLine[]>(saved && saved.length ? saved : fresh());
  const [showCheck, setShowCheck] = useState(!!saved);
  const [focused, setFocused] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [help, setHelp] = useState(false);   // typing legend under the palette; "?" in any line toggles it
  const insertSymbol = (s: string) => {
    const i = focused ?? lines.findIndex((l) => !l.locked && !l.fixed);
    if (i < 0) return;
    const el = document.querySelector(`#pe-${cssId(exerciseId)} .pl:nth-child(${i + 1}) input.finput-text`) as HTMLInputElement | null;
    const v = lines[i].formula;
    const start = el?.selectionStart ?? v.length, end = el?.selectionEnd ?? v.length;
    setLine(i, { formula: v.slice(0, start) + s + v.slice(end) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + s.length, start + s.length); });
  };

  const goal = useMemo(() => tryParse(spec.conclusion, { modal: logic === "ml" }), [spec.conclusion, logic]);
  const result = useMemo(() => checkProof(lines.map((l): InputLine => ({ formula: l.formula, rule: l.rule, refs: l.refs, depth: l.depth })),
    { allowed: availableRules ? new Set(availableRules) : undefined, modal: logic === "ml" }), [lines, availableRules, logic]);
  const done = result.complete && goal.ok && result.conclusion && eq(result.conclusion, goal.f);

  useEffect(() => {
    if (done && rec?.status !== "correct") recordExercise(exerciseId, { status: "correct", proof: lines });
  }, [done]);

  const save = (next: EditLine[]) => {
    setLines(next);
    recordExercise(exerciseId, { status: rec?.status === "correct" ? "correct" : "attempted", proof: next });
  };
  const setLine = (i: number, patch: Partial<EditLine>) => save(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const insertAfter = (i: number, depth = lines[i]?.depth ?? 0, rule = "") => {
    const next = [...lines];
    next.splice(i + 1, 0, { formula: "", rule, refs: "", depth });
    save(next);
    requestAnimationFrame(() => focusLine(i + 1));
  };
  const remove = (i: number) => { if (lines[i].locked || lines[i].fixed) return; const next = lines.filter((_, k) => k !== i); save(next.length ? next : fresh()); };
  const indent = (i: number, d: number) => setLine(i, { depth: globalThis.Math.max(0, lines[i].depth + d) });
  const focusLine = (i: number) => (document.querySelector(`#pe-${cssId(exerciseId)} .pl:nth-child(${i + 1}) input.finput-text`) as HTMLInputElement | null)?.focus();

  const groups = RULE_GROUPS.filter((g) => g.logic.includes(logic)).map((g) => ({ ...g, rules: g.rules.filter((r) => !availableRules || availableRules.includes(r) || r === "PR" || r === "AS") }));

  return (
    <div className="widget widget-proof" id={`pe-${cssId(exerciseId)}`}>
      {title && <div className="pe-title">{title}</div>}
      <div className="pe-goal">
        <span className="pe-goal-k">Goal</span>
        {spec.premises.length > 0 && <span className="pe-goal-prem">{spec.premises.map((p, i) => { const r = tryParse(p); return <span key={i}>{i > 0 && ", "}{r.ok ? <Math latex={toLatex(r.f)} /> : p}</span>; })}</span>}
        <span className="pe-turnstile">⊢{spec.system ? <sub>{spec.system}</sub> : null}</span>
        {goal.ok ? <Math latex={toLatex(goal.f)} /> : <span>{spec.conclusion}</span>}
      </div>
      <div className="fitch fitch-edit" role="table">
        {lines.map((l, i) => {
          const res = result.lines[i];
          const next = lines[i + 1];
          const isHypo = l.rule === "PR" || l.rule === "AS" || l.formula.trim() === "□";
          const hypoLast = isHypo && (!next || !(next.rule === "PR" || next.rule === "AS") || next.depth !== l.depth);
          const status = !showCheck ? "" : !l.formula.trim() && !l.rule ? "" : res.ok ? " is-ok" : " is-bad";
          return (
            <div className={"fl pl" + status} key={i} role="row">
              <span className="fl-num" role="cell">{i + 1}</span>
              <span className="fl-scope" role="cell">
                {Array.from({ length: l.depth + 1 }, (_, d) => <span className="bar" key={d} />)}
                <span className={"fl-formula" + (hypoLast ? " hypo-last" : "")}>
                  {l.locked || l.fixed
                    ? <Math latex={latexOf(l.formula)} />
                    : <FormulaInput compact noPalette normalizeOnBlur value={l.formula} onChange={(v) => setLine(i, { formula: v })} logic={logic} onEnter={() => insertAfter(i)} label={`Line ${i + 1} formula`} invalid={showCheck && !res.ok && !!l.formula} onFocus={() => setFocused(i)} onHelp={() => setHelp((o) => !o)} />}
                </span>
              </span>
              <span className="fl-just pl-just" role="cell">
                {l.locked ? <span className="fl-rule">PR</span> : (
                  <>
                    <select className="pl-rule" value={l.rule} onChange={(e) => setLine(i, { rule: e.target.value })} aria-label={`Line ${i + 1} rule`}>
                      <option value="">rule</option>
                      {groups.map((g) => <optgroup label={g.label} key={g.label}>{g.rules.map((r) => <option key={r} value={r}>{r}</option>)}</optgroup>)}
                    </select>
                    <input className="pl-refs" value={l.refs} onChange={(e) => setLine(i, { refs: e.target.value })} placeholder="lines" aria-label={`Line ${i + 1} cited lines`} onKeyDown={(e) => { if (e.key === "Enter") insertAfter(i); }} />
                  </>
                )}
              </span>
              <span className="pl-tools" role="cell">
                {!l.locked && !given && <button type="button" title="Indent (into a subproof)" aria-label="Indent" onClick={() => indent(i, 1)}>→</button>}
                {!l.locked && !given && <button type="button" title="Outdent" aria-label="Outdent" onClick={() => indent(i, -1)} disabled={l.depth === 0}>←</button>}
                {!given && <button type="button" title="Insert a line below" aria-label="Insert line below" onClick={() => insertAfter(i, l.locked ? 0 : l.depth)}>+</button>}
                {!l.locked && !given && <button type="button" title="Delete this line" aria-label="Delete line" onClick={() => remove(i)}>×</button>}
              </span>
              {showCheck && !res.ok && res.error && (l.formula.trim() || l.rule) && <span className="pl-error" role="alert">{res.error}</span>}
            </div>
          );
        })}
      </div>
      {!given && (
        <Palette logic={logic} className="pe-palette" onInsert={insertSymbol} helpOpen={help} onHelpToggle={() => setHelp((o) => !o)} />
      )}
      <div className="widget-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCheck(true)}>Check proof</button>
        {!given && <button type="button" className="btn btn-sm" onClick={() => insertAfter(lines.length - 1, lines[lines.length - 1].depth + 1, "AS")}>New subproof</button>}
        {!given && <button type="button" className="btn btn-sm" onClick={() => insertAfter(lines.length - 1, globalThis.Math.max(0, lines[lines.length - 1].depth - 1))}>End subproof</button>}
        <button type="button" className="btn btn-sm" onClick={() => { if (confirmClear) { setLines(fresh()); setShowCheck(false); setConfirmClear(false); } else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); } }}>{confirmClear ? "Really clear?" : "Clear"}</button>
      </div>
      {showCheck && (
        done
          ? <Verdict state="ok">Proof complete: every line is justified and the last line is the goal.</Verdict>
          : result.lines.every((r) => r.ok)
            ? <Verdict state="near">{result.complete ? <>Every line checks, but the last line is not the goal{goal.ok ? <>, <Math latex={toLatex(goal.f)} /></> : ""}.</> : "Every line so far checks. The proof is not finished: the last line must be at the outermost level."}</Verdict>
            : <Verdict state="bad">Some lines do not check. The problems are shown under each line.</Verdict>
      )}
      {!given && <details className="pe-help">
        <summary>How to use the editor</summary>
        <ul>
          <li>Type a formula, choose the rule, and cite lines as <code>1, 2</code> or a subproof as <code>3–5</code>.</li>
          <li>Press Enter in a line to add the next one. Use → to indent a line into a subproof and ← to come back out. An assumption (AS) at the same depth as the previous subproof starts a new one.</li>
          <li>In modal proofs, a line containing only <code>□</code> opens a strict subproof.</li>
        </ul>
      </details>}
      {solution && <Solution blocks={solution} chapterId={chapterId} onReveal={() => { if (rec?.status !== "correct") recordExercise(exerciseId, { status: "revealed", proof: lines }); }} />}
    </div>
  );
}

function latexOf(s: string): string { const r = tryParse(s); return r.ok ? toLatex(r.f) : s; }

function cssId(s: string) { return s.replace(/[^a-zA-Z0-9]/g, "_"); }

export { RULES };
