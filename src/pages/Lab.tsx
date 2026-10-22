import { useMemo, useState } from "react";
import { ProofEditor } from "../exercises/ProofEditor";
import { TruthTableEx } from "../exercises/TruthTableEx";
import { FormulaInput } from "../exercises/FormulaInput";
import { parseArgument, tryParse } from "../logic/parser";
import { toLatex, toUnicode } from "../logic/print";
import { counterexample, isTautology, isContradiction, isTFL, truthTable } from "../logic/tfl";
import { isFOL, sampleCounterexample, describeInterpretation } from "../logic/fol";
import { isSentence } from "../logic/ast";
import { Math } from "../render/Math";

/** Free-form tools: build a proof of any argument, or generate a truth table. */
export function Lab() {
  const [tab, setTab] = useState<"proof" | "table">("proof");
  return (
    <div className="page page-narrow lab">
      <header className="page-head">
        <h1>Lab</h1>
        <p className="page-lede">A scratch space. Prove any argument in the book's natural-deduction system, or generate a truth table and test a sentence or an argument.</p>
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "proof"} className={tab === "proof" ? "is-on" : ""} onClick={() => setTab("proof")}>Proof</button>
          <button type="button" role="tab" aria-selected={tab === "table"} className={tab === "table" ? "is-on" : ""} onClick={() => setTab("table")}>Truth table</button>
        </div>
      </header>
      {tab === "proof" ? <ProofLab /> : <TableLab />}
    </div>
  );
}

function ProofLab() {
  const [arg, setArg] = useState("A → B, ¬B ∴ ¬A");
  const [logic, setLogic] = useState<"tfl" | "fol" | "ml">("tfl");
  // `key` is the saved-progress key of the argument that was set up, not of whatever is typed now
  const [spec, setSpec] = useState<{ premises: string[]; conclusion: string; system?: string; key: string } | null>({ premises: ["A → B", "¬B"], conclusion: "¬A", key: toKey("A → B, ¬B ∴ ¬A") });
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const go = () => {
    try {
      const a = parseArgument(arg, { logic });
      setSpec({ premises: a.premises.map((p) => toUnicode(p)), conclusion: toUnicode(a.conclusion), system: a.system, key: toKey(arg) });
      setErr(null);
      setKey((k) => k + 1);
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="lab-proof">
      <div className="lab-row">
        <FormulaInput value={arg} onChange={setArg} logic={logic} onEnter={go} compact placeholder="Premises ∴ conclusion, e.g. A → B, ¬B ∴ ¬A" label="Argument" />
        <select value={logic} onChange={(e) => setLogic(e.target.value as "tfl")} aria-label="Logic">
          <option value="tfl">TFL</option><option value="fol">FOL</option><option value="ml">Modal</option>
        </select>
        <button type="button" className="btn btn-primary btn-sm" onClick={go}>Set up</button>
      </div>
      {err && <p className="finput-err">{err}</p>}
      {spec && <ProofEditor key={key} exerciseId={`lab.${spec.key}`} spec={spec} logic={logic} />}
    </div>
  );
}

function TableLab() {
  const [text, setText] = useState("(A → B) ∨ (B → A)");
  const parsed = useMemo(() => {
    if (/[∴⊢]/.test(text)) { try { return { arg: parseArgument(text) }; } catch (e) { return { error: (e as Error).message }; } }
    const r = tryParse(text);
    return r.ok ? { f: r.f } : { error: r.error };
  }, [text]);
  const info = useMemo(() => {
    if ("f" in parsed && parsed.f) {
      const f = parsed.f;
      if (isTFL(f)) {
        const tt = truthTable(f);
        return `${tt.rows.length} rows. ${isTautology(f) ? "Tautology." : isContradiction(f) ? "Contradiction." : "Contingent."}`;
      }
      if (isFOL(f) && isSentence(f)) return "A sentence of FOL: no truth table, but you can test an argument with it below the ∴.";
      return null;
    }
    if ("arg" in parsed && parsed.arg) {
      const { premises, conclusion } = parsed.arg;
      const all = [...premises, conclusion];
      if (all.every(isTFL)) {
        const c = counterexample(premises, conclusion);
        return c ? `Invalid. Counterexample: ${Object.entries(c).map(([k, v]) => `${k} ${v ? "T" : "F"}`).join(", ")}.` : "Valid: no row makes the premises true and the conclusion false.";
      }
      if (all.every(isFOL) && all.every(isSentence)) {
        const c = sampleCounterexample(premises, conclusion);
        return c ? `Invalid. Counterexample: ${describeInterpretation(c)}.` : "No counterexample found on a few thousand small interpretations (strong evidence of validity, not a proof).";
      }
    }
    return null;
  }, [parsed]);
  const formulas = "f" in parsed && parsed.f ? [toUnicode(parsed.f)] : "arg" in parsed && parsed.arg ? [text] : [];
  const tflOk = ("f" in parsed && parsed.f && isTFL(parsed.f)) || ("arg" in parsed && parsed.arg && [...parsed.arg.premises, parsed.arg.conclusion].every(isTFL));
  return (
    <div className="lab-table">
      <FormulaInput value={text} onChange={setText} logic="fol" placeholder="A sentence, or premises ∴ conclusion" label="Sentence or argument" />
      {"error" in parsed && parsed.error && <p className="finput-err">{parsed.error}</p>}
      {info && <p className="lab-info">{info}</p>}
      {"f" in parsed && parsed.f && <p className="muted">Parsed: <Math latex={toLatex(parsed.f)} /></p>}
      {tflOk && formulas.length > 0 && <TruthTableEx key={text} exerciseId={`lab.tt.${toKey(text)}`} formulas={formulas} sub={"arg" in parsed ? "valid" : "complete"} />}
    </div>
  );
}

function toKey(s: string) { return s.replace(/\s+/g, "").slice(0, 60); }
