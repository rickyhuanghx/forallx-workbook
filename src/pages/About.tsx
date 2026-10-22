import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { exportProgress, importProgress, resetProgress, useProgress } from "../state/progress";
import {
  deleteAccount, disableSync, enableSync, formatCode, getAccountEmail, getSyncCode, joinSync, pullAndMerge,
  requestSignIn, signOut, useSyncStatus,
} from "../state/sync";

const CONTACT = "hh695@cam.ac.uk";

export function About() {
  const [, update] = useProgress();
  const [params] = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState<string | null>(() => (params.get("signedin") ? "You are signed in. Your progress now follows you to any device you sign in on." : null));
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
        This is a free, independent study workbook built around <em>forall x: Calgary. An Introduction to Formal Logic</em>.
        It is for people learning logic on their own or alongside a course, and it does not replace the book: the official
        PDF and HTML editions are at <a href="https://forallx.openlogicproject.org" target="_blank" rel="noreferrer">forallx.openlogicproject.org</a>.
        The text, exercises and solutions are the book's own, converted from its LaTeX source. The interactive layer, which checks
        truth tables, symbolizations and natural-deduction proofs, is new, and so are the progress tracking and glossary cards.
      </p>
      <p>
        The project is open source and has no advertising and no fees. The code is released under the MIT licence; the
        repository link will appear here once it is published. The project is not affiliated with or endorsed by the book's
        authors, the Open Logic Project or the University of Calgary. It is offered as is, without warranty. The checkers were
        validated against the book's own proofs, but they can still be wrong, and where they disagree with the book, the book is right.
      </p>
      <p>
        If you hold rights in any of this material and have a concern, or if you find a mistake or have a suggestion, email
        {" "}<a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Requests from rights holders are acted on promptly, including taking material down if asked.
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
        Changes made in this edition: the chapters were converted to web pages, so the layout differs from the PDF; solutions from the
        separate solutions booklet are shown next to their exercises; exercises gained interactive checkers; three stray brackets and one
        citation in the source were corrected. In a few places the numbering of exercise parts differs from the PDF (for example the
        lettered sentence lists in exercises E and F of chapter 3 appear as numbered items). The wording of the text was not altered.
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
      <h2 id="progress">Your progress</h2>
      <p>
        Everything you do here is saved in this browser as you go: exercises checked, answers written, proofs in progress, chapters read,
        glossary cards. It survives closing the tab and new versions of the site, but not clearing the browser's site data, and it does
        not follow you to another device on its own. Sign in for that.
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
      <h2 id="privacy">Privacy</h2>
      <p>
        Without an account, nothing about you leaves your browser except the requests that fetch the pages. Your progress sits in this
        browser's local storage.
      </p>
      <p>
        If you sign in with your email, the site stores your email address, a random account id, your progress (exercises attempted,
        answers, proofs and notes, chapters read, the glossary card schedule) and the time of each save. That is all it stores. The data
        is kept in a private storage bucket at Vercel, the hosting provider, and is used only to show your progress back to you. It is
        not shared or sold, and there is no analytics or advertising script on the site. The one cookie is the session cookie that keeps
        you signed in. Sign-in emails are sent through Resend. Fonts are loaded from Google Fonts, so Google receives the usual request
        data (your IP address and browser details) when a page loads.
      </p>
      <p>
        You can delete everything held about you at any time with the button in the sign-in box above, and the deletion takes effect
        immediately. Accounts unused for two years may be removed. Questions about your data: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </div>
  );
}

function SyncPanel({ setNote }: { setNote: (s: string) => void }) {
  const [, update] = useProgress();
  const status = useSyncStatus();
  const [email, setEmail] = useState<string | null>(() => getAccountEmail());
  const [code, setCode] = useState<string | null>(() => getSyncCode());
  const [entry, setEntry] = useState("");
  const [joining, setJoining] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [armed, setArmed] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setEmail(getAccountEmail()); setCode(getSyncCode()); }, [status.state]);

  const when = status.at ? new Date(status.at).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : null;
  const line = status.state === "syncing" ? "Syncing..."
    : status.state === "error" ? `Could not reach the server (${status.error ?? "offline"}). Your work is safe here; it will retry.`
    : status.state === "synced" && when ? `Synced ${when}.`
    : email || code ? "Sync is on." : "Sync is off.";

  const request = async () => {
    setBusy(true);
    const r = await requestSignIn(entry);
    setBusy(false);
    if (r === "ok") { setSent(true); return; }
    setNote(r === "bademail" ? "That does not look like an email address."
      : r === "limited" ? "Too many sign-in emails for that address in the last hour. Try again later."
      : "The sign-in email could not be sent. Try again in a moment.");
  };

  const copy = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };

  if (email) {
    return (
      <div className="sync-box">
        <p className={"sync-status" + (status.state === "error" ? " is-error" : "")} role="status">{line}</p>
        <p>Signed in as <strong>{email}</strong>. Your progress is saved to your account as you work and merged onto any device you sign in on.</p>
        <div className="row">
          <button type="button" className="btn" disabled={busy || status.state === "syncing"} onClick={async () => { setBusy(true); await pullAndMerge(); update(() => {}); setBusy(false); }}>Sync now</button>
          <button type="button" className="btn" disabled={busy} onClick={async () => { setBusy(true); await signOut(); setBusy(false); setEmail(null); setNote("Signed out. Progress stays in this browser and on your account."); }}>Sign out</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={async () => {
            if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 5000); return; }
            setBusy(true);
            const r = await deleteAccount();
            setBusy(false); setArmed(false);
            if (r === "ok") { setEmail(null); setNote("Your account and the progress stored on the server have been deleted. The copy in this browser is untouched."); }
            else setNote("The server could not be reached. Nothing was deleted; try again in a moment.");
          }}>{armed ? "Click again to delete account and data" : "Delete my account"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sync-box">
      <p className="sync-status">{line}</p>
      {sent ? (
        <p>Check your inbox for a message from the forall x workbook. The link in it works once and expires in 15 minutes. Nothing to see here until then: progress keeps saving in this browser.</p>
      ) : (
        <>
          <p>Save your progress to an account so it follows you between devices. Enter your email and you will get a sign-in link; there is no password.</p>
          <form className="sync-join" onSubmit={(e) => { e.preventDefault(); if (entry.trim()) void request(); }}>
            <input type="email" value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="you@example.org" aria-label="Email address" autoComplete="email" spellCheck={false} />
            <button type="submit" className="btn btn-primary" disabled={busy || !entry.trim()}>{busy ? "Sending..." : "Email me a sign-in link"}</button>
          </form>
        </>
      )}
      {code ? (
        <>
          <p>This browser also syncs with a code. Signing in moves that progress onto the account.</p>
          <p>Your sync code. Enter it on the About page of any other device to pick up where you left off:</p>
          <p><span className="sync-code">{formatCode(code)}</span></p>
          <div className="row">
            <button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy code"}</button>
            <button type="button" className="btn" disabled={busy || status.state === "syncing"} onClick={async () => { setBusy(true); await pullAndMerge(); update(() => {}); setBusy(false); }}>Sync now</button>
            <button type="button" className="btn" onClick={() => { disableSync(); setCode(null); setNote("Sync is off. Progress stays in this browser; the server copy is kept until you use the code again."); }}>Turn off sync</button>
          </div>
          <p className="muted">Keep the code private: anyone who has it can read and change this progress.</p>
        </>
      ) : (
        <details className="sync-alt">
          <summary>Prefer not to give an email address? Use a sync code instead.</summary>
          <p className="muted">A sync code is a random 24-character secret. Anyone who has it can read and change the progress, and if you lose it the server copy cannot be recovered.</p>
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={async () => { setBusy(true); const c = await enableSync(); setCode(c); update(() => {}); setBusy(false); setNote("Sync is on. Enter the code below on your other devices."); }}>Create a sync code</button>
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
        </details>
      )}
    </div>
  );
}
