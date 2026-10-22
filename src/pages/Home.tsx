import { Link } from "react-router-dom";
import { useBook } from "../content/loader";
import { completedItems, useProgress } from "../state/progress";
import { Meter } from "../render/Meter";
import { Fitch } from "../render/Fitch";
import type { FitchLine } from "../content/types";

// The book's proof of ¬¬D ⊢ D by indirect proof, typeset as the masthead.
const MAST: FitchLine[] = [
  { num: "1", depth: 0, hypo: true, formula: "\\lnot\\lnot D", rule: [{ type: "text", text: "PR" }], refs: "" },
  { num: "2", depth: 1, hypo: true, formula: "\\lnot D", rule: [{ type: "text", text: "AS" }], refs: "" },
  { num: "3", depth: 1, hypo: false, formula: "\\bot", rule: [{ type: "math", latex: "\\lnot" }, { type: "text", text: "E" }], refs: "1, 2" },
  { num: "4", depth: 0, hypo: false, formula: "D", rule: [{ type: "text", text: "IP" }], refs: "2–3" },
];

export function Home() {
  const book = useBook();
  const [progress] = useProgress();
  if (!book) return <div className="loading">Loading the book</div>;

  const last = progress.last;
  const lastRef = last && book.chapters.find((c) => c.id === last.chapter);
  const done = (id: string) => !!progress.read[id];
  const exDone = (id: string) => completedItems(progress, id);
  const totalRead = book.chapters.filter((c) => /^ch/.test(c.id) && done(c.id)).length;
  const totalChapters = book.chapters.filter((c) => /^ch/.test(c.id)).length;
  const totalEx = completedItems(progress);
  const allEx = book.chapters.reduce((n, c) => n + c.exerciseCount, 0);

  return (
    <div className="home">
      <section className="mast">
        <div className="mast-text">
          <h1 className="mast-title"><span className="fx-mono">forall</span><i>x</i><span className="mast-colon">:</span> Calgary</h1>
          <p className="mast-sub">An introduction to formal logic, as an interactive study edition. Read each chapter, then work the exercises with a checker that marks truth tables, symbolizations and natural-deduction proofs as you go.</p>
          <div className="mast-actions">
            {lastRef
              ? <Link className="btn btn-primary" to={`/read/${lastRef.id}${last?.anchor ? "#" + last.anchor : ""}`}>Continue: {lastRef.number ? `Chapter ${lastRef.number}` : lastRef.title}</Link>
              : <Link className="btn btn-primary" to="/read/ch01">Start with chapter 1</Link>}
            <Link className="btn" to="/read/preface">Preface</Link>
          </div>
          <div className="mast-stats" role="group" aria-label="Your progress">
            <div className="mast-stat">
              <span className="mast-stat-k">Chapters read</span>
              <Meter value={totalRead} max={totalChapters} label="Chapters read" />
            </div>
            <div className="mast-stat">
              <span className="mast-stat-k">Exercises completed</span>
              <Meter value={totalEx} max={allEx} label="Exercises completed" />
            </div>
          </div>
        </div>
        <div className="mast-proof" aria-hidden="true">
          <Fitch lines={MAST} />
          <p className="mast-caption">Indirect proof: from ¬¬D, derive D.</p>
        </div>
      </section>

      <section className="toc" aria-label="Contents">
        {book.parts.map((part) => (
          <div className="toc-part" key={part.number}>
            <h2 className="toc-part-title"><span className="toc-part-num">Part {part.number}</span>{part.title}</h2>
            <ol className="toc-chapters">
              {part.chapters.map((c) => {
                const meta = book.chapters.find((x) => x.id === c.id)!;
                const n = exDone(c.id);
                return (
                  <li key={c.id} className={done(c.id) ? "is-read" : undefined}>
                    <Link to={`/read/${c.id}`} className="toc-link">
                      <span className="toc-num">{c.number}</span>
                      <span className="toc-title">{c.title}</span>
                      <span className="toc-meta">
                        {done(c.id) && <span className="toc-read">Read</span>}
                        {meta.exerciseCount > 0 && <Meter compact value={n} max={meta.exerciseCount} label={`Exercises completed in chapter ${c.number}`} />}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
        <div className="toc-part">
          <h2 className="toc-part-title"><span className="toc-part-num">Appendices</span></h2>
          <ol className="toc-chapters">
            {book.appendices.map((c) => (
              <li key={c.id}><Link to={`/read/${c.id}`} className="toc-link"><span className="toc-num">{c.number}</span><span className="toc-title">{c.title}</span></Link></li>
            ))}
            <li><Link to="/glossary" className="toc-link"><span className="toc-num"></span><span className="toc-title">Glossary</span></Link></li>
          </ol>
        </div>
      </section>
    </div>
  );
}
