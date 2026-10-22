import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { exportProgress, importProgress, resetProgress, useProgress } from "../state/progress";
import { disableSync, enableSync, formatCode, getSyncCode, joinSync, pullAndMerge, useSyncStatus } from "../state/sync";

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
      <p>
        Everything you do here is saved in this browser as you go: exercises checked, answers written, proofs in progress, chapters read,
        glossary cards. It survives closing the tab and new versions of the site, but not clearing the browser's site data, and it does
        not follow you to another device on its own. Turn on sync for that.
      </p>
      <SyncPanel setNote={setNote} />
      <p>You can also export a file as a backup, or import one.</p>
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

function SyncPanel({ setNote }: { setNote: (s: string) => void }) {
  const [, update] = useProgress();
  const status = useSyncStatus();
  const [code, setCode] = useState<string | null>(() => getSyncCode());
  const [joining, setJoining] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCode(getSyncCode()); }, [status.state]);

  const when = status.at ? new Date(status.at).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : null;
  const line = status.state === "syncing" ? "Syncing..."
    : status.state === "error" ? `Could not reach the server (${status.error ?? "offline"}). Your work is safe here; it will retry.`
    : status.state === "synced" && when ? `Synced ${when}.`
    : code ? "Sync is on." : "Sync is off.";

  const copy = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };

  if (!code) {
    return (
      <div className="sync-box">
        <p className="sync-status">{line}</p>
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); const c = await enableSync(); setCode(c); update(() => {}); setBusy(false); setNote("Sync is on. Enter the code below on your other devices."); }}>Turn on sync</button>
        </div>
        <p className="muted">Already have a code from another device?</p>
        <div className="sync-join">
          <input value={joining} onChange={(e) => setJoining(e.target.value)} placeholder="Sync code" aria-label="Sync code from another device" spellCheck={false} autoCapitalize="off" />
          <button type="button" className="btn" disabled={busy || !joining.trim()} onClick={async () => {
            setBusy(true);
            const r = await joinSync(joining);
            setBusy(false);
            if (r === "ok") { setCode(getSyncCode()); setJoining(""); update(() => {}); setNote("Joined. Progress from both devices has been merged."); }
            else if (r === "notfound") setNote("No progress found for that code. Check it and try again.");
            else setNote("Could not reach the server. Try again in a moment.");
          }}>Join</button>
        </div>
      </div>
    );
  }
  return (
    <div className="sync-box">
      <p className={"sync-status" + (status.state === "error" ? " is-error" : "")} role="status">{line}</p>
      <p>Your sync code. Enter it on the About page of any other device to pick up where you left off:</p>
      <p><span className="sync-code">{formatCode(code)}</span></p>
      <div className="row">
        <button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy code"}</button>
        <button type="button" className="btn" disabled={busy || status.state === "syncing"} onClick={async () => { setBusy(true); await pullAndMerge(); update(() => {}); setBusy(false); }}>Sync now</button>
        <button type="button" className="btn" onClick={() => { disableSync(); setCode(null); setNote("Sync is off. Progress stays in this browser; the server copy is kept until you use the code again."); }}>Turn off sync</button>
      </div>
      <p className="muted">Keep the code private: anyone who has it can read and change this progress.</p>
    </div>
  );
}
