import { useMemo, useState } from "react";
import type { Block } from "../content/types";
import { mainConnective } from "../logic/ast";
import { tryParse } from "../logic/parser";
import { toLatex } from "../logic/print";
import { Math } from "../render/Math";
import { recordExercise, useProgress } from "../state/progress";
import { Solution, Verdict } from "./Solution";

const OPTIONS: [string, string][] = [["¬", "¬ negation"], ["∧", "∧ conjunction"], ["∨", "∨ disjunction"], ["→", "→ conditional"], ["↔", "↔ biconditional"], ["∀", "∀ universal"], ["∃", "∃ existential"], ["atom", "none: atomic"]];

/** "What is the main connective?" for each formula in the item. */
export function MainConnective({ exerciseId, formulas, logic, solution, chapterId }: { exerciseId: string; formulas: string[]; logic: "tfl" | "fol" | "ml"; solution?: Block[]; chapterId?: string }) {
  const [progress] = useProgress();
  const rec = progress.exercises[exerciseId];
  const parsed = useMemo(() => formulas.map((s) => tryParse(s)), [formulas]);
  const [choice, setChoice] = useState<Record<number, string>>((rec?.table as Record<number, string>) ?? {});
  const [result, setResult] = useState<{ state: "ok" | "bad"; msg: string } | null>(null);
  const opts = OPTIONS.filter(([k]) => logic !== "tfl" || (k !== "∀" && k !== "∃"));

  const check = () => {
    let allOk = true;
    parsed.forEach((p, i) => {
      if (!p.ok) return;
      const want = mainConnective(p.f) ?? "atom";
      if (choice[i] !== want) allOk = false;
    });
    setResult(allOk ? { state: "ok", msg: "Correct." } : { state: "bad", msg: "Not quite. Find the connective that was added last when the sentence was built." });
    recordExercise(exerciseId, { status: allOk ? "correct" : "attempted", table: choice });
  };

  return (
    <div className="widget">
      {parsed.map((p, i) => (
        <div className="mc-row" key={i}>
          {p.ok ? <Math latex={toLatex(p.f)} /> : <span>{formulas[i]}</span>}
          <div className="chips" role="radiogroup" aria-label="Main connective">
            {opts.map(([k, label]) => (
              <label key={k} className={"chip" + (choice[i] === k ? " is-on" : "")}>
                <input type="radio" name={`mc-${exerciseId}-${i}`} checked={choice[i] === k} onChange={() => { setChoice({ ...choice, [i]: k }); setResult(null); }} />{label}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="widget-actions"><button type="button" className="btn btn-primary btn-sm" onClick={check}>Check</button></div>
      <Verdict state={result?.state ?? null}>{result?.msg}</Verdict>
      {solution && <Solution blocks={solution} chapterId={chapterId} />}
    </div>
  );
}

/** "Is this a sentence of TFL/FOL?" checked with the strict grammar. */
export function IsSentence({ exerciseId, formulas, logic, solution, chapterId, two }: { exerciseId: string; formulas: string[]; logic: "tfl" | "fol" | "ml"; solution?: Block[]; chapterId?: string; two?: boolean }) {
  const [progress] = useProgress();
  const rec = progress.exercises[exerciseId];
  const [choice, setChoice] = useState<Record<string, string>>((rec?.table as Record<string, string>) ?? {});
  const [result, setResult] = useState<{ state: "ok" | "bad"; msg: string } | null>(null);
  const strict = useMemo(() => formulas.map((s) => tryParse(s, { strict: true })), [formulas]);
  const strictest = useMemo(() => formulas.map((s) => tryParse(s, { strict: true, outerBrackets: true })), [formulas]);

  const check = () => {
    let allOk = true;
    strict.forEach((p, i) => {
      if (two) {
        if (choice[`${i}a`] !== (strictest[i].ok ? "yes" : "no")) allOk = false;
        if (choice[`${i}b`] !== (p.ok ? "yes" : "no")) allOk = false;
        return;
      }
      const want = p.ok ? "yes" : "no";
      if (choice[i] !== want) allOk = false;
    });
    setResult(allOk ? { state: "ok", msg: "Correct." } : { state: "bad", msg: "Not quite. Check the bracketing and the order of symbols against the definition of a sentence." });
    recordExercise(exerciseId, { status: allOk ? "correct" : "attempted", table: choice });
  };
  return (
    <div className="widget">
      {formulas.map((s, i) => two ? (
        <div className="mc-row mc-two" key={i}>
          <span className="raw-formula">{s}</span>
          {[["a", "strictly speaking"], ["b", "with relaxed bracketing"]].map(([q, qlabel]) => (
            <div className="chips" role="radiogroup" aria-label={`A sentence of TFL ${qlabel}?`} key={q}>
              <span className="chips-q">({q}) {qlabel}:</span>
              {[["yes", "yes"], ["no", "no"]].map(([k, label]) => (
                <label key={k} className={"chip" + (choice[`${i}${q}`] === k ? " is-on" : "")}>
                  <input type="radio" name={`is-${exerciseId}-${i}${q}`} checked={choice[`${i}${q}`] === k} onChange={() => { setChoice({ ...choice, [`${i}${q}`]: k }); setResult(null); }} />{label}
                </label>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="mc-row" key={i}>
          <span className="raw-formula">{s}</span>
          <div className="chips" role="radiogroup" aria-label={`Is this a sentence of ${logic.toUpperCase()}?`}>
            {[["yes", `a sentence of ${logic.toUpperCase()}`], ["no", "not a sentence"]].map(([k, label]) => (
              <label key={k} className={"chip" + (choice[i] === k ? " is-on" : "")}>
                <input type="radio" name={`is-${exerciseId}-${i}`} checked={choice[i] === k} onChange={() => { setChoice({ ...choice, [i]: k }); setResult(null); }} />{label}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="widget-actions"><button type="button" className="btn btn-primary btn-sm" onClick={check}>Check</button></div>
      <Verdict state={result?.state ?? null}>{result?.msg}</Verdict>
      {solution && <Solution blocks={solution} chapterId={chapterId} />}
    </div>
  );
}
