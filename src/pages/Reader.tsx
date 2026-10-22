import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { chapterOrder, useBook, useChapter } from "../content/loader";
import { now, setRead, useProgress } from "../state/progress";
import { Blocks } from "../render/Blocks";
import { Inlines } from "../render/Inline";
import { ExerciseSection } from "../exercises/ExerciseSection";

export function Reader() {
  const { id } = useParams();
  const book = useBook();
  const { chapter, error } = useChapter(id);
  const [progress, update] = useProgress();
  const loc = useLocation();
  const [tocOpen, setTocOpen] = useState(false);

  // remember position
  const loadedId = chapter?.id;
  useEffect(() => {
    if (!loadedId) return;
    update((p) => { p.visited[loadedId] = now(); p.last = { chapter: loadedId }; });
  }, [loadedId]);

  // scroll to hash once content is in
  useEffect(() => {
    if (!chapter) return;
    if (loc.hash) {
      const el = document.getElementById(decodeURIComponent(loc.hash.slice(1)));
      if (el) { el.scrollIntoView({ block: "start" }); el.classList.add("target-flash"); setTimeout(() => el.classList.remove("target-flash"), 1600); }
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [chapter, loc.hash]);

  const order = useMemo(() => (book ? chapterOrder(book) : []), [book]);
  const idx = id ? order.indexOf(id) : -1;
  const prev = idx > 0 ? order[idx - 1] : null;
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  const refOf = (cid: string) => book?.chapters.find((c) => c.id === cid);

  if (error) return <div className="loading">That chapter does not exist. <Link to="/">Back to the contents</Link></div>;
  if (!book || !chapter) return <div className="loading">Loading</div>;

  const part = chapter.part ? book.parts.find((p) => p.number === chapter.part) : null;
  const sections = chapter.blocks.filter((b) => b.type === "heading" && b.level === 2) as Extract<typeof chapter.blocks[number], { type: "heading" }>[];
  const isRead = !!progress.read[chapter.id];
  const label = chapter.id === "preface" ? "" : chapter.id.startsWith("app") ? `Appendix ${chapter.number}` : `Chapter ${chapter.number}`;

  return (
    <div className="reader">
      <button type="button" className="toc-toggle" onClick={() => setTocOpen((o) => !o)} aria-expanded={tocOpen}>
        {tocOpen ? "Hide contents" : "Contents"}
      </button>
      <aside className={"side" + (tocOpen ? " side-open" : "")} aria-label="Chapter navigation">
        {part && (
          <div className="side-part">
            <div className="side-part-title">Part {part.number}. {part.title}</div>
            <ol className="side-chapters">
              {part.chapters.map((c) => (
                <li key={c.id} className={c.id === chapter.id ? "is-current" : undefined}>
                  <Link to={`/read/${c.id}`} onClick={() => setTocOpen(false)}><span className="side-num">{c.number}</span>{c.title}</Link>
                  {c.id === chapter.id && sections.length > 0 && (
                    <ol className="side-sections">
                      {sections.map((s) => <li key={s.id}><a href={`#${s.id}`} onClick={() => setTocOpen(false)}><span className="side-num">{s.number}</span><Inlines nodes={s.children} /></a></li>)}
                      {chapter.exercises.length > 0 && <li><a href="#exercises" onClick={() => setTocOpen(false)}><span className="side-num"></span>Practice exercises</a></li>}
                    </ol>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
        {!part && (
          <div className="side-part">
            <div className="side-part-title">{chapter.id === "preface" ? "Front matter" : "Appendices"}</div>
            <ol className="side-chapters">
              {(chapter.id === "preface" ? [{ id: "preface", number: "", title: "Preface" }] : book.appendices).map((c) => (
                <li key={c.id} className={c.id === chapter.id ? "is-current" : undefined}>
                  <Link to={`/read/${c.id}`}><span className="side-num">{c.number}</span>{c.title}</Link>
                  {c.id === chapter.id && sections.length > 0 && (
                    <ol className="side-sections">
                      {sections.map((s) => <li key={s.id}><a href={`#${s.id}`}><Inlines nodes={s.children} /></a></li>)}
                    </ol>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </aside>

      <article className="chapter">
        <header className="ch-head">
          {label && <div className="ch-label">{label}</div>}
          <h1 className="ch-title"><Inlines nodes={chapter.titleInlines} /></h1>
        </header>
        <div className="prose">
          <Blocks blocks={chapter.blocks} chapterId={chapter.id} />
        </div>
        {chapter.exercises.length > 0 && <ExerciseSection chapter={chapter} />}
        <footer className="ch-foot">
          <label className="read-toggle">
            <input type="checkbox" checked={isRead} onChange={(e) => setRead(chapter.id, e.target.checked)} />
            <span>{isRead ? "Marked as read" : "Mark this chapter as read"}</span>
          </label>
          <nav className="pager" aria-label="Chapter pager">
            {prev ? <Link to={`/read/${prev}`} className="pager-prev"><span className="pager-k">Previous</span><span>{titleOf(prev)}</span></Link> : <span />}
            {next ? <Link to={`/read/${next}`} className="pager-next"><span className="pager-k">Next</span><span>{titleOf(next)}</span></Link> : <span />}
          </nav>
        </footer>
      </article>
    </div>
  );

  function titleOf(cid: string) {
    const r = refOf(cid);
    if (!r) return cid;
    return r.number ? `${r.number}. ${r.title}` : r.title;
  }
}
