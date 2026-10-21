import type { FitchLine } from "../content/types";
import { Inlines } from "./Inline";
import { Math } from "./Math";

/** Static rendering of a Fitch-style proof from the book. */
export function Fitch({ lines }: { lines: FitchLine[] }) {
  return (
    <div className="fitch" role="table">
      {lines.map((l, i) => {
        const next = lines[i + 1];
        const hypoLast = l.hypo && (!next || !next.hypo || next.depth !== l.depth);
        const numIsText = /^\d*$/.test(l.num);
        return (
          <div className={"fl" + (l.ellipsis ? " fl-ellipsis" : "")} key={i} role="row">
            <span className="fl-num" role="cell">{numIsText ? l.num : <Math latex={l.num} />}</span>
            <span className="fl-scope" role="cell">
              {Array.from({ length: l.depth + 1 }, (_, d) => <span className="bar" key={d} />)}
              <span className={"fl-formula" + (hypoLast ? " hypo-last" : "")}>
                {l.ellipsis ? <span className="vdots">⋮</span> : l.formula.trim() === "\\Box" ? <Math latex="\Box" /> : <Math latex={l.formula} />}
              </span>
            </span>
            <span className="fl-just" role="cell">
              {l.rule && <span className="fl-rule"><Inlines nodes={l.rule} /></span>}
              {l.refs ? <span className="fl-refs"> {l.refs}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
