import katex from "katex";
import { useMemo } from "react";

const cache = new Map<string, string>();

export function renderLatex(latex: string, display = false): string {
  const key = (display ? "D" : "I") + latex;
  let html = cache.get(key);
  if (html === undefined) {
    try {
      html = katex.renderToString(latex, { displayMode: display, throwOnError: false, strict: "ignore", trust: false, output: "html" });
    } catch {
      html = `<span class="math-error">${latex.replace(/</g, "&lt;")}</span>`;
    }
    cache.set(key, html);
  }
  return html;
}

export function Math({ latex, display = false, className }: { latex: string; display?: boolean; className?: string }) {
  const html = useMemo(() => renderLatex(latex, display), [latex, display]);
  return display
    ? <div className={"math-display" + (className ? " " + className : "")} dangerouslySetInnerHTML={{ __html: html }} />
    : <span className={"math" + (className ? " " + className : "")} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Wrap an align/multline body in an aligned environment for KaTeX. */
export function alignedLatex(latex: string, env?: string): string {
  if (env === "align" || env === "multline" || env === "gather") {
    const body = latex.replace(/\\\\\s*$/, "");
    if (env === "multline") return `\\begin{aligned}${body.split("\\\\").map((l, i) => (i ? "&\\quad " : "&") + l).join("\\\\")}\\end{aligned}`;
    if (env === "gather") return `\\begin{gathered}${body}\\end{gathered}`;
    return `\\begin{aligned}${body}\\end{aligned}`;
  }
  return latex;
}
