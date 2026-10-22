import type { Block, Chapter, ExercisePart, ListItem } from "../content/types";
import { Blocks } from "../render/Blocks";
import { Inlines, plainText } from "../render/Inline";
import { useProgress } from "../state/progress";
import { FreeResponse } from "./FreeResponse";
import { IsSentence, MainConnective } from "./MainConnective";
import { ProofEditor, type EditLine, type ProofSpec } from "./ProofEditor";
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
            <span className="expart-count">{part.items.length ? `${part.items.filter((it) => status(it.id) === "correct" || status(it.id) === "done").length}/${part.items.length}` : (status(part.id) === "done" ? "done" : "")}</span>
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
      {part.items.length === 0 && <FreeResponse exerciseId={part.id} chapterId={chapter.id} />}
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
    <li className={"exitem" + (st === "correct" || st === "done" ? " is-done" : st ? " is-tried" : "")} id={`ex-${part.letter}-${n}`}>
      <div className="exitem-q">{body}</div>
      <Widget item={item} id={id} part={part} chapter={chapter} instr={instr} />
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
      if (!fitch || fitch.type !== "fitch") return <FreeResponse exerciseId={id} solution={sol} chapterId={chapter.id} />;
      const given: EditLine[] = fitch.lines.map((l) => {
        const r = tryParse(l.formula);
        const formula = r.ok ? toUnicode(r.f) : l.formula;
        const rule = l.hypo ? (l.depth === 0 ? "PR" : "AS") : "";
        return { formula, rule, refs: "", depth: l.depth, fixed: true, locked: l.hypo };
      });
      const premises = given.filter((l) => l.depth === 0 && l.rule === "PR").map((l) => l.formula);
      const conclusion = given[given.length - 1].formula;
      return <ProofEditor exerciseId={id} spec={{ premises, conclusion }} logic={part.logic} solution={sol} chapterId={chapter.id} given={given} />;
    }
    case "proof": {
      const specs = proofSpecs(formulas, instr);
      if (!specs.length) return <FreeResponse exerciseId={id} solution={sol} chapterId={chapter.id} />;
      return (
        <>
          {specs.map((s, i) => <ProofEditor key={i} exerciseId={specs.length > 1 ? `${id}.${i + 1}` : id} spec={s} logic={part.logic} solution={i === specs.length - 1 ? sol : undefined} chapterId={chapter.id} title={specs.length > 1 ? `Proof ${i + 1} of ${specs.length}` : undefined} />)}
        </>
      );
    }
    default:
      return <FreeResponse exerciseId={id} solution={sol} chapterId={chapter.id} />;
  }
}

/** Work out what has to be proved from the item's formulas and the part's instruction. */
export function proofSpecs(formulas: string[], instr: string): ProofSpec[] {
  const arg = formulas.find((f) => /[∴⊢]/.test(f));
  if (arg) {
    const m = arg.match(/^(.*?)\s*[∴⊢]\s*(?:_\s*\{?\\?(?:mathbf\{)?([A-Za-z0-9]+)\}?\}?\s*)?(.*)$/);
    if (!m) return [];
    const premises = m[1].trim() ? splitTop(m[1]) : [];
    return [{ premises, conclusion: m[3].trim(), system: m[2] }];
  }
  if (!formulas.length) return [];
  if (/interderivable|provably equivalent|equivalent/.test(instr) && formulas.length >= 2) {
    return [{ premises: [formulas[0]], conclusion: formulas[1] }, { premises: [formulas[1]], conclusion: formulas[0] }];
  }
  if (/contrary|inconsistent/.test(instr)) return [{ premises: formulas, conclusion: "⊥" }];
  if (/theorem/.test(instr) || formulas.length === 1) return [{ premises: [], conclusion: formulas[0] }];
  return [];
}

/** Split "A, B ∧ C, D" on top-level commas (commas inside predicate arguments are kept). */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export type { Block };
