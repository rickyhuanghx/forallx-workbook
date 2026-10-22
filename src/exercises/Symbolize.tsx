import { useMemo, useState } from "react";
import type { Block } from "../content/types";
import { alphaEq, eq, isSentence } from "../logic/ast";
import { describeInterpretation, isFOL, monadicEquivalent, sampleEquivalent } from "../logic/fol";
import { tryParse } from "../logic/parser";
import { toLatex, toUnicode } from "../logic/print";
import { equivalent, isTFL, valuations, evalTFL, allLetters } from "../logic/tfl";
import { Math } from "../render/Math";
import { recordExercise, useProgress } from "../state/progress";
import { FormulaInput } from "./FormulaInput";
import { MarkDone, Solution, Verdict } from "./Solution";

interface Props {
  exerciseId: string;
  logic: "tfl" | "fol" | "ml";
  solution?: Block[];
  chapterId?: string;
}

function firstMath(blocks: Block[] | undefined): string | null {
  if (!blocks) return null;
  for (const b of blocks) {
    if (b.type === "para") for (const n of b.children) if (n.type === "math") return n.latex;
    if (b.type === "displaymath") return b.latex;
  }
  return null;
}

export function Symbolize({ exerciseId, logic, solution, chapterId }: Props) {
  const [progress] = useProgress();
  const rec = progress.exercises[exerciseId];
  const [value, setValue] = useState(rec?.answer ?? "");
  // likely: agreement found only by sampling, so not recorded as correct; the learner may mark it done
  const [result, setResult] = useState<{ state: "ok" | "near" | "bad" | "info"; msg: React.ReactNode; likely?: boolean } | null>(null);
  const bookLatex = useMemo(() => firstMath(solution), [solution]);
  const book = useMemo(() => (bookLatex ? tryParse(bookLatex, { logic }) : null), [bookLatex, logic]);

  const check = () => {
    const r = tryParse(value, { logic });
    if (!r.ok) { setResult({ state: "bad", msg: r.error }); return; }
    const mine = r.f;
    if (!book || !book.ok) {
      setResult({ state: "info", msg: <>Parsed as <Math latex={toLatex(mine)} />. The book gives no answer for this one, so compare with the symbolization key and mark it yourself.</> });
      recordExercise(exerciseId, { status: "attempted", answer: value });
      return;
    }
    const theirs = book.f;
    if (eq(mine, theirs)) {
      setResult({ state: "ok", msg: "Correct, and written exactly as the book writes it." });
      recordExercise(exerciseId, { status: "correct", answer: value });
      return;
    }
    if (logic === "tfl" && isTFL(mine) && isTFL(theirs)) {
      if (equivalent(mine, theirs)) {
        setResult({ state: "ok", msg: <>Correct: <Math latex={toLatex(mine)} /> is truth-functionally equivalent to the book's <Math latex={toLatex(theirs)} />.</> });
        recordExercise(exerciseId, { status: "correct", answer: value });
      } else {
        const ls = allLetters([mine, theirs]);
        const v = valuations(ls).find((val) => evalTFL(mine, val) !== evalTFL(theirs, val))!;
        const desc = ls.map((l) => `${l} ${v[l] ? "true" : "false"}`).join(", ");
        setResult({ state: "bad", msg: <>Not equivalent to the book's answer. With {desc}, yours is {evalTFL(mine, v) ? "true" : "false"} but the book's is {evalTFL(theirs, v) ? "true" : "false"}.</> });
        recordExercise(exerciseId, { status: "attempted", answer: value });
      }
      return;
    }
    if (alphaEq(mine, theirs)) {
      setResult({ state: "ok", msg: "Correct: the same sentence up to the choice of bound variables." });
      recordExercise(exerciseId, { status: "correct", answer: value });
      return;
    }
    if (isFOL(mine) && isFOL(theirs) && isSentence(mine) && isSentence(theirs)) {
      // exact where the sentences are monadic without identity; otherwise sampling, which cannot prove equivalence
      const exact = monadicEquivalent(mine, theirs);
      if (exact?.equivalent) {
        setResult({ state: "ok", msg: <>Correct: <Math latex={toLatex(mine)} /> is logically equivalent to the book's <Math latex={toLatex(theirs)} /> (checked on every interpretation that could tell them apart).</> });
        recordExercise(exerciseId, { status: "correct", answer: value });
        return;
      }
      const s = exact ?? sampleEquivalent(mine, theirs);
      if (s.equivalent) {
        setResult({ state: "near", likely: true, msg: <>Agrees with the book's <Math latex={toLatex(theirs)} /> on all {s.samples} sampled interpretations, so it is very likely equivalent, but the checker cannot prove it. Compare it with the book's answer, and mark it done if they match.</> });
        recordExercise(exerciseId, { status: "attempted", answer: value });
      } else {
        setResult({ state: "bad", msg: <>Differs from the book's answer. Counterexample ({describeInterpretation(s.counter!)}): yours and the book's disagree there.</> });
        recordExercise(exerciseId, { status: "attempted", answer: value });
      }
      return;
    }
    setResult({ state: "near", msg: <>Parsed as {toUnicode(mine)}, which differs from the book's answer. Compare them.</> });
    recordExercise(exerciseId, { status: "attempted", answer: value });
  };

  const done = rec?.status === "correct" || rec?.status === "done";
  return (
    <div className="widget widget-symbolize">
      <FormulaInput value={value} onChange={(v) => { setValue(v); setResult(null); }} logic={logic} onEnter={check} placeholder="Your symbolization" />
      <div className="widget-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={check} disabled={!value.trim()}>Check</button>
        {(!book || result?.likely) && <MarkDone done={done} onChange={(d) => recordExercise(exerciseId, { status: d ? "done" : "attempted", answer: value })} />}
      </div>
      <Verdict state={result?.state ?? null}>{result?.msg}</Verdict>
      {solution && <Solution blocks={solution} chapterId={chapterId} onReveal={() => { if (!done) recordExercise(exerciseId, { status: "revealed", answer: value }); }} />}
    </div>
  );
}
