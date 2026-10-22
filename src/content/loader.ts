import { useEffect, useState } from "react";
import type { Book, Chapter } from "./types";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
let bookPromise: Promise<Book> | null = null;
const chapterCache = new Map<string, Promise<Chapter>>();
/** The ids the converter writes: preface, ch01..ch48, appA..appC. Anything else never reaches fetch. */
const CHAPTER_ID = /^(preface|ch\d{2}|app[A-Z])$/;

// A failed fetch is dropped from the cache, so the next attempt (after reconnecting) really fetches again.
export function loadBook(): Promise<Book> {
  if (!bookPromise) {
    const p = fetch(`${base}/content/book.json`).then((r) => {
      if (!r.ok) throw new Error("The book could not be loaded");
      return r.json() as Promise<Book>;
    });
    p.catch(() => { if (bookPromise === p) bookPromise = null; });
    bookPromise = p;
  }
  return bookPromise;
}

export function loadChapter(id: string): Promise<Chapter> {
  if (!CHAPTER_ID.test(id)) return Promise.reject(new Error(`No chapter ${id}`));
  let p = chapterCache.get(id);
  if (!p) {
    const f: Promise<Chapter> = fetch(`${base}/content/chapters/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`No chapter ${id}`);
      return r.json() as Promise<Chapter>;
    });
    f.catch(() => { if (chapterCache.get(id) === f) chapterCache.delete(id); });
    chapterCache.set(id, f);
    p = f;
  }
  return p;
}

/** The book index; while it cannot be fetched this stays null and retries every few seconds and on reconnect. */
export function useBook(): Book | null {
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => loadBook().then((b) => { if (live) setBook(b); }).catch(() => { if (live) timer = setTimeout(attempt, 5000); });
    const online = () => { clearTimeout(timer); void attempt(); };
    void attempt();
    window.addEventListener("online", online);
    return () => { live = false; clearTimeout(timer); window.removeEventListener("online", online); };
  }, []);
  return book;
}

export function useChapter(id: string | undefined): { chapter: Chapter | null; error: string | null } {
  const [state, setState] = useState<{ chapter: Chapter | null; error: string | null }>({ chapter: null, error: null });
  useEffect(() => {
    if (!id) return;
    let live = true;
    setState({ chapter: null, error: null });
    loadChapter(id).then((c) => live && setState({ chapter: c, error: null })).catch((e) => live && setState({ chapter: null, error: e.message }));
    return () => { live = false; };
  }, [id]);
  return state;
}

/** Ordered list of all chapter ids (preface, chapters, appendices). */
export function chapterOrder(book: Book): string[] {
  return ["preface", ...book.parts.flatMap((p) => p.chapters.map((c) => c.id)), ...book.appendices.map((a) => a.id)];
}
