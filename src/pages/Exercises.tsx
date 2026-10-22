import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadChapter, useBook } from "../content/loader";
import type { Chapter } from "../content/types";
import { isComplete, useProgress } from "../state/progress";
import { Meter } from "../render/Meter";

const KIND_LABEL: Record<string, string> = {
  symbolize: "Symbolization", truthtable: "Truth tables", proof: "Proofs", "main-connective": "Main connective",
  "is-sentence": "Syntax", free: "Written answer", cite: "Rule citations",
};

/** Overview of every exercise set in the book with completion status. */
export function Exercises() {
  const book = useBook();
  const [progress] = useProgress();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!book) return;
    let live = true;
    setFailed(false);
    const ids = book.chapters.filter((c) => c.exerciseCount > 0 || /^ch/.test(c.id)).map((c) => c.id);
    Promise.all(ids.map(loadChapter)).then((cs) => { if (live) setChapters(cs); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [book, attempt]);
  if (!book) return <div className="loading">Loading</div>;

  const status = (id: string) => progress.exercises[id]?.status;
  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1>Exercises</h1>
        <p className="page-lede">Every practice set in the book, with what you have completed. Sets with a checker are marked; the rest show the book's solution when it has one, and you mark them done yourself.</p>
      </header>
      {failed
        ? <p>The exercise sets could not be loaded. Check your connection, then <button type="button" className="linkish" onClick={() => setAttempt((n) => n + 1)}>try again</button>.</p>
        : chapters.length === 0 && <p className="loading">Loading the exercise sets</p>}
      <ol className="exlist">
        {chapters.filter((c) => c.exercises.length).map((ch) => {
          const items = ch.exercises.flatMap((p) => p.items);
          const done = items.filter((it) => it.id && isComplete(status(it.id))).length;
          return (
            <li key={ch.id} className="exlist-ch">
              <Link to={`/read/${ch.id}#exercises`} className="exlist-title"><span className="toc-num">{ch.number}</span>{ch.title}</Link>
              <Meter value={done} max={items.length} label={`Exercises completed in chapter ${ch.number}`} unit="completed" />
              <ul className="exlist-parts">
                {ch.exercises.map((p) => {
                  const pd = p.items.filter((it) => it.id && isComplete(status(it.id))).length;
                  const checked = p.kind !== "free";
                  return (
                    <li key={p.id}>
                      <Link to={`/read/${ch.id}#ex-${p.letter}`}>{p.letter ? `${p.letter}. ` : ""}{KIND_LABEL[p.kind] ?? "Exercises"}</Link>
                      <span className="exlist-meta">
                        <span>{checked ? "checked" : p.hasSolutions ? "solutions" : "self-marked"}</span>
                        {p.items.length
                          ? <Meter compact value={pd} max={p.items.length} label={`Set ${p.letter || ch.number} completed`} />
                          : <span>{isComplete(status(p.id)) ? "done" : "one answer for the set"}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
