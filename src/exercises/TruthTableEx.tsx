import { useMemo, useState } from "react";
import type { Block } from "../content/types";
import type { Formula } from "../logic/ast";
import { parseArgument, tryParse } from "../logic/parser";
import { displayTokens, toLatex } from "../logic/print";
import { allLetters, evalTFL, isTFL, valuations, type Valuation } from "../logic/tfl";
import { subformulas } from "../logic/ast";
import { Math } from "../render/Math";
import { recordExercise, useProgress } from "../state/progress";
import { Solution, Verdict } from "./Solution";

type Sub = "complete" | "classify" | "equivalent" | "satisfiable" | "valid" | "partial" | "classify-partial" | "equivalent-partial" | "satisfiable-partial" | "valid-partial";

interface Props {
  exerciseId: string;
  formulas: string[];     // logic strings; one may be an argument with ∴
  sub: Sub | string | null;
  solution?: Block[];
  chapterId?: string;
}

type Cell = "T" | "F" | "";

interface Column { f: Formula; toks: ReturnType<typeof displayTokens>; subs: Formula[]; role?: "premise" | "conclusion" }

const VERDICTS: Record<string, { q: string; options: [string, string][] }> = {
  classify: { q: "The sentence is", options: [["tautology", "a tautology"], ["contradiction", "a contradiction"], ["contingent", "contingent"]] },
  equivalent: { q: "The sentences are", options: [["yes", "equivalent"], ["no", "not equivalent"]] },
  satisfiable: { q: "The sentences are", options: [["yes", "jointly satisfiable"], ["no", "jointly unsatisfiable"]] },
  valid: { q: "The argument is", options: [["yes", "valid"], ["no", "invalid"]] },
};

export function TruthTableEx({ exerciseId, formulas, sub, solution, chapterId }: Props) {
  const [progress] = useProgress();
  const rec = progress.exercises[exerciseId];
  const partial = !!sub && sub.includes("partial");
  const base = (sub ?? "complete").replace("-partial", "") as "complete" | "classify" | "equivalent" | "satisfiable" | "valid";

  const parsed = useMemo(() => {
    const cols: Column[] = [];
    let argument: { premises: Formula[]; conclusion: Formula } | null = null;
    for (const s of formulas) {
      if (/[∴⊢⊨]/.test(s)) {
        try { argument = parseArgument(s); } catch { return null; }
        for (const p of argument.premises) cols.push({ f: p, toks: displayTokens(p), subs: subformulas(p), role: "premise" });
        cols.push({ f: argument.conclusion, toks: displayTokens(argument.conclusion), subs: subformulas(argument.conclusion), role: "conclusion" });
      } else {
        const r = tryParse(s);
        if (!r.ok || !isTFL(r.f)) return null;
        cols.push({ f: r.f, toks: displayTokens(r.f), subs: subformulas(r.f) });
      }
    }
    if (!cols.length) return null;
    const letters = allLetters(cols.map((c) => c.f));
    return { cols, letters, rows: valuations(letters), argument };
  }, [formulas]);

  const saved = rec?.table as { cells?: Record<string, Cell>; verdict?: string } | undefined;
  const [cells, setCells] = useState<Record<string, Cell>>(saved?.cells ?? {});
  const [verdict, setVerdict] = useState<string>(saved?.verdict ?? "");
  const [result, setResult] = useState<{ state: "ok" | "bad" | "near"; msg: React.ReactNode } | null>(null);
  const [wrong, setWrong] = useState<Set<string>>(new Set());

  if (!parsed) return <div className="widget"><p className="muted">This item could not be turned into a truth table automatically.</p>{solution && <Solution blocks={solution} chapterId={chapterId} />}</div>;
  const { cols, letters, rows, argument } = parsed;

  const key = (r: number, c: number, t: number) => `${r}.${c}.${t}`;
  const cycle = (k: string) => {
    setCells((prev) => {
      const cur = prev[k] ?? "";
      const next: Cell = cur === "" ? "T" : cur === "T" ? "F" : "";
      return { ...prev, [k]: next };
    });
    setResult(null);
  };

  const expected = (r: number, c: number, subIdx: number) => evalTFL(cols[c].subs[subIdx], rows[r]);

  const trueVerdict = (): string => {
    const mainVals = (c: number) => rows.map((v) => evalTFL(cols[c].f, v));
    if (base === "classify") { const m = mainVals(0); return m.every(Boolean) ? "tautology" : m.every((x) => !x) ? "contradiction" : "contingent"; }
    if (base === "equivalent") { const a = mainVals(0), b = mainVals(1); return a.every((x, i) => x === b[i]) ? "yes" : "no"; }
    if (base === "satisfiable") return rows.some((v) => cols.every((c) => evalTFL(c.f, v))) ? "yes" : "no";
    if (base === "valid" && argument) return rows.some((v) => argument.premises.every((p) => evalTFL(p, v)) && !evalTFL(argument.conclusion, v)) ? "no" : "yes";
    return "";
  };

  const check = () => {
    const bad = new Set<string>();
    let filled = 0, total = 0;
    rows.forEach((_, r) => cols.forEach((col, c) => col.toks.forEach((t) => {
      if (t.sub === null) return;
      total++;
      const k = key(r, c, t.sub);
      const v = cells[k] ?? "";
      if (!v) return;
      filled++;
      if ((v === "T") !== expected(r, c, t.sub)) bad.add(k);
    })));
    setWrong(bad);
    const want = trueVerdict();
    const verdictOk = base === "complete" ? true : verdict === want;
    const rowComplete = (r: number) => cols.every((col, c) => col.toks.every((t) => t.sub === null || (cells[key(r, c, t.sub)] ?? "") !== ""));
    const completeRows = rows.filter((_, r) => rowComplete(r)).length;

    if (bad.size) {
      setResult({ state: "bad", msg: `${bad.size} cell${bad.size > 1 ? "s are" : " is"} wrong (outlined). Fix them and check again.` });
      recordExercise(exerciseId, { status: "attempted", table: { cells, verdict } });
      return;
    }
    if (base !== "complete" && !verdict) { setResult({ state: "near", msg: "The cells filled so far are right. Now choose a verdict below." }); return; }
    if (!verdictOk) {
      setResult({ state: "bad", msg: "The filled cells are right, but the verdict is not. Look again at the main connective column(s)." });
      recordExercise(exerciseId, { status: "attempted", table: { cells, verdict } });
      return;
    }
    if (partial) {
      // a partial table needs enough rows to justify the verdict
      const needsWitness = (base === "classify" && want === "contingent") || (base === "equivalent" && want === "no") || (base === "satisfiable" && want === "yes") || (base === "valid" && want === "no");
      if (needsWitness && completeRows === 0) { setResult({ state: "near", msg: "Right verdict. A partial truth table must show at least one complete row that witnesses it." }); return; }
      if (!needsWitness && completeRows < rows.length && filled < total) {
        setResult({ state: "ok", msg: "Right verdict. To show it with a partial table you would argue that no row can come out the other way; the book's solution shows one way to write that up." });
      } else {
        setResult({ state: "ok", msg: "Correct." });
      }
      recordExercise(exerciseId, { status: "correct", table: { cells, verdict } });
      return;
    }
    if (filled < total) { setResult({ state: "near", msg: `All ${filled} filled cells are right. ${total - filled} to go.` }); return; }
    setResult({ state: "ok", msg: base === "complete" ? "Correct, every cell." : "Correct: the table and the verdict." });
    recordExercise(exerciseId, { status: "correct", table: { cells, verdict } });
  };

  const fillLetters = () => {
    // convenience: fill the sentence-letter columns, which are mechanical
    setCells((prev) => {
      const next = { ...prev };
      rows.forEach((v, r) => cols.forEach((col, c) => col.toks.forEach((t) => {
        if (t.sub !== null && col.subs[t.sub].kind === "atom") next[key(r, c, t.sub)] = v[(col.subs[t.sub] as { pred: string }).pred] ? "T" : "F";
      })));
      return next;
    });
  };

  return (
    <div className="widget widget-tt">
      <div className="tt-scroll">
        <table className="tt tt-edit">
          <thead>
            <tr>
              {letters.map((l) => <th key={l} className="tt-letter"><Math latex={l.replace(/(\d+)/, "_{$1}")} /></th>)}
              {cols.map((col, c) => col.toks.map((t, i) => (
                <th key={`${c}.${i}`} className={(i === 0 ? "bl " : "") + (t.main ? "tt-main" : "")}><Math latex={t.latex} /></th>
              )))}
            </tr>
          </thead>
          <tbody>
            {rows.map((v, r) => (
              <tr key={r}>
                {letters.map((l) => <td key={l} className="tt-letter">{v[l] ? "T" : "F"}</td>)}
                {cols.map((col, c) => col.toks.map((t, i) => {
                  if (t.sub === null) return <td key={`${c}.${i}`} className={i === 0 ? "bl" : ""} />;
                  const k = key(r, c, t.sub);
                  const val = cells[k] ?? "";
                  return (
                    <td key={`${c}.${i}`} className={(i === 0 ? "bl " : "") + (t.main ? "tt-main " : "") + (wrong.has(k) ? "is-wrong" : "")}>
                      <button type="button" className={"tt-cell tt-" + (val || "empty")} onClick={() => cycle(k)} aria-label={`Row ${r + 1}, ${t.text}: ${val || "empty"}`}>{val || "·"}</button>
                    </td>
                  );
                }))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {base !== "complete" && VERDICTS[base] && (
        <div className="tt-verdict" role="radiogroup" aria-label={VERDICTS[base].q}>
          <span className="tt-verdict-q">{VERDICTS[base].q}</span>
          {VERDICTS[base].options.map(([val, label]) => (
            <label key={val} className={"chip" + (verdict === val ? " is-on" : "")}>
              <input type="radio" name={`v-${exerciseId}`} value={val} checked={verdict === val} onChange={() => { setVerdict(val); setResult(null); }} />
              {label}
            </label>
          ))}
        </div>
      )}
      <div className="widget-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={check}>Check</button>
        <button type="button" className="btn btn-sm" onClick={fillLetters}>Fill letter columns</button>
        <button type="button" className="btn btn-sm" onClick={() => { setCells({}); setWrong(new Set()); setResult(null); }}>Clear</button>
        <span className="muted">Click a cell to cycle T, F, blank.</span>
      </div>
      <Verdict state={result?.state ?? null}>{result?.msg}</Verdict>
      {solution && <Solution blocks={solution} chapterId={chapterId} onReveal={() => { if (rec?.status !== "correct") recordExercise(exerciseId, { status: "revealed", table: { cells, verdict } }); }} />}
      {!solution && cols.length === 1 && <details className="muted"><summary>Formula as parsed</summary><Math latex={toLatex(cols[0].f)} /></details>}
    </div>
  );
}

export type { Valuation };
