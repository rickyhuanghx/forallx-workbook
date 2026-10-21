import type { Block, ListItem, TableRow } from "../content/types";
import { Inlines } from "./Inline";
import { Math, alignedLatex } from "./Math";
import { Fitch } from "./Fitch";

export function Blocks({ blocks, chapterId }: { blocks: Block[]; chapterId?: string }) {
  // split columns on colbreak
  return <>{blocks.map((b, i) => <BlockNode key={i} block={b} chapterId={chapterId} />)}</>;
}

export function BlockNode({ block, chapterId }: { block: Block; chapterId?: string }) {
  switch (block.type) {
    case "para":
      return <p className={block.align ? `align-${block.align}` : undefined}><Inlines nodes={block.children} chapterId={chapterId} /></p>;
    case "heading": {
      const Tag = (`h${globalThis.Math.min(block.level + 1, 5)}` as unknown) as "h2";
      return (
        <Tag id={block.id} className={`hd hd-${block.level}`}>
          {block.number && <span className="hd-num">{block.number}</span>}
          <Inlines nodes={block.children} chapterId={chapterId} />
        </Tag>
      );
    }
    case "list":
      return <List block={block} chapterId={chapterId} />;
    case "quote":
      return <blockquote><Blocks blocks={block.children} chapterId={chapterId} /></blockquote>;
    case "center":
      return <div className="center"><Blocks blocks={block.children} chapterId={chapterId} /></div>;
    case "factoid":
      return <aside className="factoid"><Blocks blocks={block.children} chapterId={chapterId} /></aside>;
    case "answer":
      return <div className="answer"><Blocks blocks={block.children} chapterId={chapterId} /></div>;
    case "columns": {
      const cols: Block[][] = [[]];
      for (const b of block.children) {
        if (b.type === "colbreak") cols.push([]);
        else cols[cols.length - 1].push(b);
      }
      return (
        <div className="columns">
          {cols.map((c, i) => <div className="column" key={i}><Blocks blocks={c} chapterId={chapterId} /></div>)}
        </div>
      );
    }
    case "displaymath":
      return <Math latex={alignedLatex(block.latex, block.env)} display />;
    case "fitch":
      return <Fitch lines={block.lines} />;
    case "table":
      return <Table block={block} chapterId={chapterId} />;
    case "figure":
      return block.svg
        ? <figure className="figure" aria-label={block.alt} dangerouslySetInnerHTML={{ __html: block.svg }} />
        : <figure className="figure figure-alt"><figcaption>{block.alt}</figcaption></figure>;
    case "space":
      return <div className="vspace" />;
    case "colbreak":
    case "exercises-start":
    case "problempart":
      return null;
    case "unknown-env":
      return <div className={`env-${block.name}`}><Blocks blocks={block.children} chapterId={chapterId} /></div>;
    default:
      return null;
  }
}

function List({ block, chapterId }: { block: Extract<Block, { type: "list" }>; chapterId?: string }) {
  const kind = block.kind;
  if (kind === "ekey") {
    return (
      <dl className="ekey">
        {block.items.map((it, i) => (
          <div className="ekey-row" key={i}>
            <dt>{it.label && <Inlines nodes={it.label} chapterId={chapterId} />}</dt>
            <dd><ItemBody item={it} chapterId={chapterId} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  if (kind === "earg") {
    return (
      <div className="earg">
        {block.items.map((it, i) => {
          const isConc = it.label && it.label.some((n) => n.type === "text" && n.text.includes("∴"));
          return (
            <div className={"earg-row" + (isConc ? " earg-conc" : "")} key={i}>
              <span className="earg-label">{isConc ? "∴" : it.label ? <Inlines nodes={it.label} chapterId={chapterId} /> : ""}</span>
              <span className="earg-body"><ItemBody item={it} chapterId={chapterId} /></span>
            </div>
          );
        })}
      </div>
    );
  }
  if (kind === "enumerate") {
    return (
      <ol className="enumerate">
        {block.items.map((it, i) => (
          <li key={i} id={it.n ? `item-${it.n}` : undefined} value={it.n}>
            {it.label ? <span className="li-label"><Inlines nodes={it.label} chapterId={chapterId} /></span> : null}
            <ItemBody item={it} chapterId={chapterId} />
          </li>
        ))}
      </ol>
    );
  }
  if (kind === "compactlist" || kind === "numberlist" || kind === "factoidnumber") {
    return (
      <ol className={kind}>
        {block.items.map((it, i) => (
          <li key={i} className={it.label !== undefined && it.label.length === 0 ? "li-unlabelled" : undefined}>
            {it.label && it.label.length ? <span className="li-label"><Inlines nodes={it.label} chapterId={chapterId} /></span> : null}
            <ItemBody item={it} chapterId={chapterId} />
          </li>
        ))}
      </ol>
    );
  }
  if (kind === "description") {
    return (
      <dl className="description">
        {block.items.map((it, i) => (
          <div key={i}><dt>{it.label && <Inlines nodes={it.label} chapterId={chapterId} />}</dt><dd><ItemBody item={it} chapterId={chapterId} /></dd></div>
        ))}
      </dl>
    );
  }
  return (
    <ul className={kind}>
      {block.items.map((it, i) => (
        <li key={i}>
          {it.label && it.label.length ? <span className="li-label"><Inlines nodes={it.label} chapterId={chapterId} /></span> : null}
          <ItemBody item={it} chapterId={chapterId} />
        </li>
      ))}
    </ul>
  );
}

function ItemBody({ item, chapterId }: { item: ListItem; chapterId?: string }) {
  // a single paragraph renders inline so the list stays tight
  if (item.children.length === 1 && item.children[0].type === "para") return <Inlines nodes={item.children[0].children} chapterId={chapterId} />;
  return <Blocks blocks={item.children} chapterId={chapterId} />;
}

export function Table({ block, chapterId, className }: { block: Extract<Block, { type: "table" }>; chapterId?: string; className?: string }) {
  const tt = block.truthTable;
  const cols = block.cols;
  const renderRow = (row: TableRow, ri: number, isHead: boolean) => {
    let ci = 0;
    return (
      <tr key={ri} className={row.hlineBefore ? "hline-before" : undefined}>
        {row.cells.map((cell, k) => {
          const col = cols[ci] ?? { kind: "c", align: "center", borderLeft: 0 };
          const cls = [
            `al-${col.align}`,
            col.borderLeft ? "bl" : "",
            col.borderLeft > 1 ? "bl2" : "",
            col.kind === "d" || col.kind === "e" || col.kind === "f" ? "tight" : "",
          ].filter(Boolean).join(" ");
          ci += cell.colspan ?? 1;
          const Cell = isHead ? "th" : "td";
          return <Cell key={k} className={cls} colSpan={cell.colspan}><Inlines nodes={cell.children} chapterId={chapterId} /></Cell>;
        })}
      </tr>
    );
  };
  const headRows = block.rows.length > 1 && block.rows[1].hlineBefore ? 1 : 0;
  return (
    <figure className={"tbl-wrap" + (className ? " " + className : "")} id={block.id}>
      <table className={tt ? "tt" : "tbl"}>
        {headRows ? <thead>{renderRow(block.rows[0], 0, true)}</thead> : null}
        <tbody>{block.rows.slice(headRows).map((r, i) => renderRow(r, i + headRows, false))}</tbody>
      </table>
      {block.caption && <figcaption>{block.number && <span className="tbl-num">Table {block.number}.</span>} <Inlines nodes={block.caption} chapterId={chapterId} /></figcaption>}
    </figure>
  );
}
