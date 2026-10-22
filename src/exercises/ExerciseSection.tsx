import type { Block, Chapter, ExercisePart, ListItem } from "../content/types";
import { Blocks } from "../render/Blocks";
import { Inlines, plainText } from "../render/Inline";
import { useEffect } from "react";
import { externalRevision, isComplete, recordExercise, useProgress } from "../state/progress";
import { Meter } from "../render/Meter";
import { FreeResponse } from "./FreeResponse";
import { IsSentence, MainConnective } from "./MainConnective";
import { ProofEditor, type EditLine } from "./ProofEditor";
import { proofSpecs, type ProofSpec } from "../logic/specs";
import { tryParse } from "../logic/parser";
import { toUnicode } from "../logic/print";
import { Solution } from "./Solution";
import { Symbolize } from "./Symbolize";
import { TruthTableEx } from "./TruthTableEx";

const KIND_LABEL: Record<string, string> = {
  symbolize: "Symbolization, checked", truthtable: "Truth tables, checked", proof: "Proofs, checked",
  "main-connective": "Checked", "is-sentence": "Checked", free: "Written answer", cite: "Add the citations, checked",
};

export function ExerciseSection({ chapter }: { chapter: Chapter }) {
  const [progress] = useProgress();
  const status = (id?: string) => (id ? progress.exercises[id]?.status : undefined);
  return (
    <section className="exercises" id="exercises" aria-labelledby="exercises-h">
      <h2 className="hd hd-2" id="exercises-h">Practice exercises</h2>
      {chapter.exercises.map((part) => (
        <div className="expart" key={part.id} id={`ex-${part.letter}`}>
          <div className="expart-head">
            <span className="expart-letter">{part.letter}</span>
            <span className="expart-kind">{KIND_LABEL[part.kind]}{part.kind === "free" && part.hasSolutions ? ", with the book's solution" : ""}</span>
            <span className="expart-count">
              {part.items.length
                ? <Meter compact value={part.items.filter((it) => isComplete(status(it.id))).length} max={part.items.length} label={`Set ${part.letter} completed`} unit="done" />
                : (status(part.id) === "done" ? <span className="meter is-full"><span className="meter-num">Done</span></span> : null)}
            </span>
          </div>
          <PartBody part={part} chapter={chapter} />
        </div>
      ))}
    </section>
  );
}

function PartBody({ part, chapter }: { part: ExercisePart; chapter: Chapter }) {
  const instr = part.blocks.find((b) => b.type === "para");
  const instrText = instr && instr.type === "para" ? plainText(instr.children).toLowerCase() : "";
  let itemIndex = 0;
  const widgets = part.blocks.map((b, i) => {
    if (b.type === "list" && (b.kind === "compactlist" || b.kind === "numberlist" || b.kind === "enumerate")) {
      return (
        <ol className="exitems" key={i}>
          {b.items.map((it) => {
            const n = ++itemIndex;
            return <ExerciseItem key={it.id ?? n} item={it} n={n} part={part} chapter={chapter} instr={instrText} />;
          })}
        </ol>
      );
    }
    return <Blocks key={i} blocks={[b]} chapterId={chapter.id} />;
  });
  return (
    <div className="expart-body prose">
      {widgets}
      {part.solution && <Solution blocks={part.solution} chapterId={chapter.id} label="Show the book's discussion" />}
      {part.solutionFull && part.items.length === 0 && <Solution blocks={part.solutionFull} chapterId={chapter.id} />}
      {part.solutionFull && part.items.length > 0 && !part.items.some((it) => it.solution) && <Solution blocks={part.solutionFull} chapterId={chapter.id} />}
      {part.items.length === 0 && <FreeResponse exerciseId={part.id} chapterId={chapter.id} logic={part.logic} />}
    </div>
  );
}

function ExerciseItem({ item, n, part, chapter, instr }: { item: ListItem; n: number; part: ExercisePart; chapter: Chapter; instr: string }) {
  const [progress] = useProgress();
  const id = item.id ?? `${part.id}.${n}`;
  const st = progress.exercises[id]?.status;
  const shown = part.kind === "cite" ? item.children.filter((b) => b.type !== "fitch") : item.children;
  const body = shown.length === 1 && shown[0].type === "para"
    ? <p><Inlines nodes={shown[0].children} chapterId={chapter.id} /></p>
    : <Blocks blocks={shown} chapterId={chapter.id} />;
  return (
    <li className={"exitem" + (isComplete(st) ? " is-done" : st ? " is-tried" : "")} id={`ex-${part.letter}-${n}`}>
      <div className="exitem-q">{body}</div>
      {/* remounts when the saved record changes from another device or tab, so the widget shows the newer answer */}
      <Widget key={externalRevision(id)} item={item} id={id} part={part} chapter={chapter} instr={instr} />
    </li>
  );
}

function Widget({ item, id, part, chapter, instr }: { item: ListItem; id: string; part: ExercisePart; chapter: Chapter; instr: string }) {
  const sol = item.solution;
  const formulas = item.formulas ?? [];
  switch (part.kind) {
    case "symbolize":
      return <Symbolize exerciseId={id} logic={part.logic} solution={sol} chapterId={chapter.id} />;
    case "truthtable":
      return <TruthTableEx exerciseId={id} formulas={formulas} sub={part.sub} solution={sol} chapterId={chapter.id} />;
    case "main-connective":
      return <MainConnective exerciseId={id} formulas={formulas} logic={part.logic} solution={sol} chapterId={chapter.id} />;
    case "is-sentence":
      return <IsSentence exerciseId={id} formulas={formulas} logic={part.logic} solution={sol} chapterId={chapter.id} two={part.sub === "two"} />;
    case "cite": {
      const fitch = item.children.find((b) => b.type === "fitch");
      if (!fitch || fitch.type !== "fitch") return <FreeResponse exerciseId={id} solution={sol} chapterId={chapter.id} logic={part.logic} />;
      const given: EditLine[] = fitch.lines.map((l) => {
        const r = tryParse(l.formula, { logic: part.logic });
        const formula = r.ok ? toUnicode(r.f) : l.formula;
        const rule = l.hypo ? (l.depth === 0 ? "PR" : "AS") : "";
        return { formula, rule, refs: "", depth: l.depth, fixed: true, locked: l.hypo };
      });
      const premises = given.filter((l) => l.depth === 0 && l.rule === "PR").map((l) => l.formula);
      const conclusion = given[given.length - 1].formula;
      return <ProofEditor exerciseId={id} spec={{ premises, conclusion }} logic={part.logic} solution={sol} chapterId={chapter.id} partLetter={part.letter} given={given} />;
    }
    case "proof": {
      const specs = proofSpecs(formulas, instr);
      if (!specs.length) return <FreeResponse exerciseId={id} solution={sol} chapterId={chapter.id} logic={part.logic} />;
      const proof = specs.length === 1
        ? <ProofEditor exerciseId={id} spec={specs[0]} logic={part.logic} solution={sol} chapterId={chapter.id} partLetter={part.letter} />
        : <MultiProof id={id} specs={specs} logic={part.logic} solution={sol} chapterId={chapter.id} partLetter={part.letter} />;
      // "give a proof, or an interpretation showing there is none" (ch36 H, I): some items have no proof, so every
      // item also takes a written interpretation the learner marks done; offered on all items, it gives nothing away
      if (!/construct an interpretation/.test(instr)) return proof;
      return (
        <>
          {proof}
          <div className="either-or">
            <p className="muted">No proof possible? Describe an interpretation that shows it, then mark the exercise done.</p>
            <FreeResponse exerciseId={id} chapterId={chapter.id} logic={part.logic} />
          </div>
        </>
      );
    }
    default:
      return <FreeResponse exerciseId={id} solution={sol} chapterId={chapter.id} logic={part.logic} />;
  }
}

/** An item with several proofs: each proof saves under id.k; the item itself is recorded correct once every proof is. */
export function MultiProof({ id, specs, logic, solution, chapterId, partLetter }: { id: string; specs: ProofSpec[]; logic: ExercisePart["logic"]; solution?: Block[]; chapterId: string; partLetter?: string }) {
  const [progress] = useProgress();
  const allDone = specs.every((_, i) => progress.exercises[`${id}.${i + 1}`]?.status === "correct");
  const recorded = progress.exercises[id]?.status === "correct";
  useEffect(() => { if (allDone && !recorded) recordExercise(id, { status: "correct" }); }, [allDone, recorded, id]);
  return (
    <>
      {specs.map((s, i) => <ProofEditor key={i} exerciseId={`${id}.${i + 1}`} spec={s} logic={logic} solution={i === specs.length - 1 ? solution : undefined} chapterId={chapterId} partLetter={partLetter} title={`Proof ${i + 1} of ${specs.length}`} />)}
    </>
  );
}

// proofSpecs (what each proof item asks for) lives in ../logic/specs.ts so the tests can check every item.

export type { Block };
