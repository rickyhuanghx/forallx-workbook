import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { exportProgress, importProgress, resetProgress, useProgress } from "../state/progress";

export function About() {
  const [, update] = useProgress();
  const fileRef = useRef<HTMLInputElement>(null);
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const download = () => {
    const blob = new Blob([exportProgress()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `forallx-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    try { importProgress(await f.text()); update(() => {}); setNote("Progress restored from the file."); } catch { setNote("That file could not be read."); }
  };
  return (
    <div className="page page-narrow prose about">
      <header className="page-head"><h1>About this edition</h1></header>
      <p>
        This is an interactive study edition of <em>forall x: Calgary. An Introduction to Formal Logic</em>, built for personal study.
        The text, exercises and solutions are the book's own, converted from its LaTeX source. The interactive layer, which checks
        truth tables, symbolizations and natural-deduction proofs, is new, and so are the progress tracking and glossary cards.
      </p>
      <h2>Credits and licence</h2>
      <p>
        <em>forall x: Calgary</em> is based on <em>forall x</em> by P. D. Magnus, in the version revised and expanded by Tim Button,
        with material by J. Robert Loftis, Robert Trueman, Aaron Thomas-Bolduc and Richard Zach. It is licensed under a
        {" "}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Creative Commons Attribution 4.0</a> licence.
        The source is at <a href="https://github.com/rzach/forallx-yyc" target="_blank" rel="noreferrer">github.com/rzach/forallx-yyc</a> (this edition was converted from
        commit 63c92e8, October 2026) and the official PDF and HTML editions are at
        {" "}<a href="https://forallx.openlogicproject.org" target="_blank" rel="noreferrer">forallx.openlogicproject.org</a>.
        The full credits are in the <Link to="/read/preface">preface</Link>.
      </p>
      <p>
        Changes made in this edition: the chapters were converted to web pages; solutions from the separate solutions booklet
        are shown next to their exercises; exercises gained interactive checkers; three stray brackets and one citation in the
        source were corrected. Nothing else in the text was altered.
      </p>
      <details className="errata">
        <summary>Slips in the printed solutions that the checker found</summary>
        <ul>
          <li>Chapter 20, A: the theorem ((A→B)→A)→A cites IP 1–8; the subproof is lines 2–8.</li>
          <li>Chapter 36, D (third proof): line 11 drops the negation that line 10 has. E: F(x) should read F(y); L(j,x) should read L(j,a). F: citation 2––9.</li>
          <li>Chapter 38, B: an unresolved citation; ∀E used where ∀I is meant; a missing ¬ before line 9. C: an unresolved citation.</li>
          <li>Chapter 39, A: =E 6, 7 cites its own line; =E 3, 7 should cite line 4; DS 7, 5 treats F(a) as ¬¬F(a). B to D: unbalanced brackets in two premises and one unresolved citation.</li>
          <li>Chapter 43, A: □I 3–4 for a strict subproof that starts at line 2. B: ¬I 2–6 should be 2–7. E: ∨I 4 cites its own line. F: ¬I 5–9 should be 6–9.</li>
        </ul>
      </details>
      <h2>How the checkers work</h2>
      <ul>
        <li><strong>Symbolization.</strong> In TFL your sentence is compared with the book's answer by truth table, so any logically equivalent sentence counts, and you are told when yours is written differently. In FOL the two sentences are compared on a few thousand small interpretations; a disagreement is a real counterexample, agreement is strong evidence.</li>
        <li><strong>Truth tables.</strong> Every cell is checked against the computed value. The main connective is highlighted.</li>
        <li><strong>Proofs.</strong> Each line is checked against the rule it cites, including the subproof and name restrictions of the book's system (chapters 17, 19, 21, 36, 38, 39, 43). The checker was validated by replaying the book's own proofs.</li>
      </ul>
      <h2>Typing symbols</h2>
      <p>Use the symbol buttons, or type the ASCII forms the book itself suggests (appendix on accessibility): <code>~</code> or <code>-</code> for ¬, <code>/\</code> or <code>&amp;</code> for ∧, <code>\/</code> for ∨, <code>-&gt;</code> or <code>&gt;</code> for →, <code>&lt;-&gt;</code> for ↔, <code>_|_</code> or <code>!?</code> for ⊥, <code>Ax</code> or <code>@x</code> for ∀x, <code>Ex</code> or <code>3x</code> for ∃x, <code>:.</code> for ∴, <code>|-</code> for ⊢, <code>[]</code> for □ and <code>&lt;&gt;</code> for ◇ (in modal exercises; elsewhere <code>&lt;&gt;</code> is ↔). Also accepted: <code>v</code> for ∨, <code>#</code> for ⊥, <code>dia</code> for ◇. Subscripts: <code>A1</code> or <code>A_1</code>.</p>
      <h2>Your progress</h2>
      <p>Progress lives in this browser only. Export it to move to another device, or to keep a backup.</p>
      <div className="row">
        <button type="button" className="btn" onClick={download}>Export progress</button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import progress</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => upload(e.target.files?.[0])} />
        <button type="button" className="btn btn-danger" onClick={() => { if (armed) { resetProgress(); update(() => {}); setArmed(false); setNote("Progress reset."); } else { setArmed(true); setTimeout(() => setArmed(false), 4000); } }}>{armed ? "Click again to delete everything" : "Reset progress"}</button>
      </div>
      {note && <p className="muted" role="status">{note}</p>}
    </div>
  );
}
