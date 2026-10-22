import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useBook } from "../content/loader";
import { Inlines } from "../render/Inline";
import { now, useProgress } from "../state/progress";

export function Glossary() {
  const book = useBook();
  const [progress, update] = useProgress();
  const [mode, setMode] = useState<"list" | "cards">("list");
  const [q, setQ] = useState("");
  const [showing, setShowing] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const entries = useMemo(() => {
    if (!book) return [];
    const sorted = [...book.glossary].sort((a, b) => a.name.localeCompare(b.name));
    const needle = q.trim().toLowerCase();
    return needle ? sorted.filter((g) => g.name.toLowerCase().includes(needle)) : sorted;
  }, [book, q]);

  // a term pop-up links to /glossary#g-<key>; scroll there once the list is in
  const loc = useLocation();
  useEffect(() => {
    if (!book || !loc.hash.startsWith("#g-")) return;
    const el = document.getElementById(decodeURIComponent(loc.hash.slice(1)));
    if (el) { el.scrollIntoView({ block: "start" }); el.classList.add("target-flash"); setTimeout(() => el.classList.remove("target-flash"), 1600); }
  }, [book, loc.hash]);

  if (!book) return <div className="loading">Loading</div>;

  // spaced repetition: due cards first (box 0 = new)
  const nowMs = now();
  const due = book.glossary
    .map((g) => ({ g, f: progress.flash[g.key] ?? { box: 0, due: 0 } }))
    .filter((x) => x.f.due <= nowMs)
    .sort((a, b) => a.f.box - b.f.box || a.f.due - b.f.due);
  const current = showing ? book.glossary.find((g) => g.key === showing) : due[0]?.g ?? null;
  const grade = (ok: boolean) => {
    if (!current) return;
    const prev = progress.flash[current.key] ?? { box: 0, due: 0 };
    const box = ok ? Math.min(prev.box + 1, 5) : 0;
    const days = [0, 1, 3, 7, 14, 30][box];
    update((p) => { p.flash[current.key] = { box, due: now() + days * 86400000 + (ok ? 0 : 60000) }; });
    setRevealed(false);
    setShowing(null);
  };

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1>Glossary</h1>
        <p className="page-lede">The book's defined terms, {book.glossary.length} in all. Each entry links back to the chapter that introduces it. Switch to cards to drill them: a term you know moves to a later box, one you miss comes back tomorrow.</p>
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "list"} className={mode === "list" ? "is-on" : ""} onClick={() => setMode("list")}>List</button>
          <button type="button" role="tab" aria-selected={mode === "cards"} className={mode === "cards" ? "is-on" : ""} onClick={() => setMode("cards")}>Cards{due.length ? ` (${due.length} due)` : ""}</button>
        </div>
      </header>

      {mode === "list" && (
        <>
          <input className="filter" type="search" placeholder="Filter terms" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter terms" />
          <dl className="glossary">
            {entries.map((g) => (
              <div className="gl-entry" key={g.key} id={`g-${g.key}`}>
                <dt><Inlines nodes={g.nameInlines} /></dt>
                <dd>
                  <Inlines nodes={g.description} />
                  {g.chapter && <Link className="gl-ch" to={`/read/${g.chapter}`}>{chapterLabel(g.chapter)}</Link>}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {mode === "cards" && (
        <div className="cards">
          {!current && <p className="empty">Nothing is due. Come back tomorrow, or <button type="button" className="linkish" onClick={() => setShowing(book.glossary[Math.floor(Math.random() * book.glossary.length)].key)}>draw a random card</button>.</p>}
          {current && (
            <div className="card">
              <div className="card-term"><Inlines nodes={current.nameInlines} /></div>
              {revealed ? (
                <>
                  <div className="card-def"><Inlines nodes={current.description} /></div>
                  <div className="card-actions">
                    <button type="button" className="btn" onClick={() => grade(false)}>Missed it</button>
                    <button type="button" className="btn btn-primary" onClick={() => grade(true)}>Knew it</button>
                  </div>
                </>
              ) : (
                <div className="card-actions"><button type="button" className="btn btn-primary" onClick={() => setRevealed(true)}>Show the definition</button></div>
              )}
              <div className="card-meta">{due.length} due today</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function chapterLabel(id: string): string {
  if (id.startsWith("ch")) return `Chapter ${parseInt(id.slice(2), 10)}`;
  if (id.startsWith("app")) return `Appendix ${id.slice(3)}`;
  return "Preface";
}
