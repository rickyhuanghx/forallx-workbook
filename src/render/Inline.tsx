import { Fragment, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Inline } from "../content/types";
import { Math } from "./Math";
import { Blocks } from "./Blocks";
import { GlossaryTerm } from "./GlossaryTerm";

export function Inlines({ nodes, chapterId }: { nodes: Inline[]; chapterId?: string }) {
  return <>{nodes.map((n, i) => <InlineNode key={i} node={n} chapterId={chapterId} />)}</>;
}

export function InlineNode({ node, chapterId }: { node: Inline; chapterId?: string }): ReactNode {
  switch (node.type) {
    case "text":
      return node.text;
    case "emph":
      return <em><Inlines nodes={node.children} chapterId={chapterId} /></em>;
    case "strong":
      return <strong><Inlines nodes={node.children} chapterId={chapterId} /></strong>;
    case "sc":
      return <span className="sc"><Inlines nodes={node.children} chapterId={chapterId} /></span>;
    case "nobr":
      return <span className="nobr"><Inlines nodes={node.children} chapterId={chapterId} /></span>;
    case "u":
      return <u><Inlines nodes={node.children} chapterId={chapterId} /></u>;
    case "sup":
      return <sup><Inlines nodes={node.children} chapterId={chapterId} /></sup>;
    case "box":
      return <span className="fbox"><Inlines nodes={node.children} chapterId={chapterId} /></span>;
    case "code":
      return <code>{node.text}</code>;
    case "define":
      return <dfn className="define" id={node.anchor ?? "def-" + slug(node.term)}><Inlines nodes={node.children} chapterId={chapterId} /></dfn>;
    case "math":
      return <Math latex={node.latex} display={!!node.display} />;
    case "footnote":
      return <Footnote n={node.n}><Inlines nodes={node.children.map(pb)} chapterId={chapterId} /></Footnote>;
    case "ref":
      return <RefLink node={node} chapterId={chapterId} />;
    case "gls":
      return <GlossaryTerm term={node.key} text={node.text ?? node.key} />;
    case "link":
      return <a href={node.href} target="_blank" rel="noreferrer"><Inlines nodes={node.children} chapterId={chapterId} /></a>;
    case "blank":
      return <span className="blank">{node.sub ? <sub>{node.sub}</sub> : null}</span>;
    case "forallx":
      return <span className="forallx"><span className="fx-mono">forall</span><i>x</i>{node.calgary ? <span className="fx-mono">: Calgary</span> : null}</span>;
    case "br":
      return <br />;
    case "parbreak":
      return <span className="parbreak" />;
    case "block":
      return <Blocks blocks={[node.block]} chapterId={chapterId} />;
    default:
      return null;
  }
}

const pb = (n: Inline): Inline => (n.type === "parbreak" ? { type: "br" } : n);

function RefLink({ node, chapterId }: { node: Extract<Inline, { type: "ref" }>; chapterId?: string }) {
  // "chapters 7, 18 and 29", "parts II to IV": each number links to its own target
  if (node.segments && !node.children) {
    return <>{node.segments.map((s, i) => s.href
      ? <RefAnchor key={i} href={s.href} chapterId={chapterId}>{s.text}</RefAnchor>
      : <Fragment key={i}>{s.text}</Fragment>)}</>;
  }
  const text = node.children ? <Inlines nodes={node.children} chapterId={chapterId} /> : node.text ?? "?";
  if (!node.href) return <span className="ref-missing">{text}</span>;
  return <RefAnchor href={node.href} chapterId={chapterId}>{text}</RefAnchor>;
}

function RefAnchor({ href, chapterId, children }: { href: string; chapterId?: string; children: ReactNode }) {
  // same-chapter anchors use plain hash links so the browser scrolls
  const sameChapter = chapterId && href.startsWith(`/read/${chapterId}#`);
  if (sameChapter) return <a className="ref" href={href.slice(href.indexOf("#"))}>{children}</a>;
  return <Link className="ref" to={href}>{children}</Link>;
}

function Footnote({ n, children }: { n: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={"fn" + (open ? " fn-open" : "")}>
      <button type="button" className="fn-mark" aria-expanded={open} aria-label={`Footnote ${n}`} onClick={() => setOpen((o) => !o)}>
        {n}
      </button>
      <span className="fn-body" role="note">
        <span className="fn-num">{n}</span> {children}
      </span>
    </span>
  );
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function plainText(nodes: Inline[]): string {
  return nodes.map((n) => {
    switch (n.type) {
      case "text": return n.text;
      case "code": return n.text;
      case "math": return n.latex;
      case "gls": return n.text ?? n.key;
      case "ref": return n.text ?? "";
      case "forallx": return "forall x";
      case "blank": return "___";
      case "define": case "emph": case "strong": case "sc": case "nobr": case "u": case "sup": case "box": case "link": case "footnote":
        return plainText(n.children);
      default: return "";
    }
  }).join("");
}

export { Fragment };
