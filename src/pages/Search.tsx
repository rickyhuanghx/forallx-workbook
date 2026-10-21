import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { chapterOrder, loadChapter, useBook } from "../content/loader";
import type { Block, Chapter, Inline } from "../content/types";
import { plainText } from "../render/Inline";
import { toUnicode } from "../logic/print";
import { tryParse } from "../logic/parser";

interface Entry { chapter: string; chapterTitle: string; anchor: string; section: string; text: string }

let indexPromise: Promise<Entry[]> | null = null;

function blockText(b: Block): string {
  switch (b.type) {
    case "para": return inlineText(b.children);
    case "heading": return inlineText(b.children);
    case "list": return b.items.map((it) => (it.label ? inlineText(it.label) + " " : "") + it.children.map(blockText).join(" ")).join(" ");
    case "quote": case "center": case "factoid": case "columns": case "answer": case "unknown-env": return b.children.map(blockText).join(" ");
    case "displaymath": return mathText(b.latex);
    case "fitch": return b.lines.map((l) => mathText(l.formula)).join(" ");
    case "table": return b.rows.map((r) => r.cells.map((c) => inlineText(c.children)).join(" ")).join(" ");
    default: return "";
  }
}
function mathText(latex: string): string {
  const r = tryParse(latex);
  return r.ok ? toUnicode(r.f) : latex;
}
function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === "math" ? mathText(n.latex) : n.type === "block" ? blockText(n.block) : plainText([n]))).join("");
}

function buildIndex(ids: string[], titles: Record<string, string>): Promise<Entry[]> {
  return Promise.all(ids.map((id) => loadChapter(id))).then((chapters: Chapter[]) => {
    const out: Entry[] = [];
    for (const ch of chapters) {
      let section = "";
      let anchor = "";
      for (const b of ch.blocks) {
        if (b.type === "heading" && b.level <= 2) { section = (b.number ? b.number + " " : "") + inlineText(b.children); anchor = b.id; }
        const t = blockText(b).replace(/\s+/g, " ").trim();
        if (t) out.push({ chapter: ch.id, chapterTitle: titles[ch.id], anchor, section, text: t });
      }
      ch.exercises.forEach((part) => {
        const t = part.blocks.map(blockText).join(" ").replace(/\s+/g, " ").trim();
        if (t) out.push({ chapter: ch.id, chapterTitle: titles[ch.id], anchor: "exercises", section: `Exercises ${part.letter}`, text: t });
      });
    }
    return out;
  });
}

export function Search() {
  const book = useBook();
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [index, setIndex] = useState<Entry[] | null>(null);

  useEffect(() => {
    if (!book) return;
    const titles: Record<string, string> = {};
    for (const c of book.chapters) titles[c.id] = c.number ? `${c.number}. ${c.title}` : c.title;
    if (!indexPromise) indexPromise = buildIndex(chapterOrder(book), titles);
    indexPromise.then(setIndex);
  }, [book]);

  const results = useMemo(() => {
    if (!index || !q.trim()) return [];
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = index.map((e) => {
      const lower = e.text.toLowerCase();
      const hits = terms.filter((t) => lower.includes(t)).length;
      return { e, score: hits === terms.length ? 2 : hits > 0 ? 1 : 0 };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    return scored.slice(0, 80);
  }, [index, q]);

  return (
    <div className="page page-narrow">
      <header className="page-head"><h1>Search</h1><p className="page-lede">{q ? <>Results for <em>{q}</em></> : "Type a word or symbol in the search box above."}</p></header>
      {!index && q && <p className="loading">Building the index</p>}
      {index && q && results.length === 0 && <p className="empty">Nothing matched. Try a different word, or a logical symbol such as ∀.</p>}
      <ol className="results">
        {results.map(({ e }, i) => (
          <li key={i}>
            <Link to={`/read/${e.chapter}${e.anchor ? "#" + e.anchor : ""}`} className="result-where">{e.chapterTitle}{e.section ? ` · ${e.section}` : ""}</Link>
            <p className="result-text">{snippet(e.text, q)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function snippet(text: string, q: string): string {
  const term = q.toLowerCase().split(/\s+/)[0];
  const i = text.toLowerCase().indexOf(term);
  const start = Math.max(0, i - 90);
  const s = text.slice(start, start + 240);
  return (start > 0 ? "…" : "") + s + (start + 240 < text.length ? "…" : "");
}
