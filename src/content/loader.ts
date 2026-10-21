import { useEffect, useState } from "react";
import type { Book, Chapter } from "./types";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
let bookPromise: Promise<Book> | null = null;
const chapterCache = new Map<string, Promise<Chapter>>();

export function loadBook(): Promise<Book> {
  if (!bookPromise) bookPromise = fetch(`${base}/content/book.json`).then((r) => r.json());
  return bookPromise;
}

export function loadChapter(id: string): Promise<Chapter> {
  let p = chapterCache.get(id);
  if (!p) {
    p = fetch(`${base}/content/chapters/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`No chapter ${id}`);
      return r.json();
    });
    chapterCache.set(id, p);
  }
  return p;
}

export function useBook(): Book | null {
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => { loadBook().then(setBook); }, []);
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
