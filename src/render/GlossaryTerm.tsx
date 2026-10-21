import { useState } from "react";
import { Link } from "react-router-dom";
import { useBook } from "../content/loader";
import { Inlines } from "./Inline";

/** A glossary term in running text: tap to see the definition, link to the glossary. */
export function GlossaryTerm({ term, text }: { term: string; text: string }) {
  const book = useBook();
  const [open, setOpen] = useState(false);
  const entry = book?.glossary.find((g) => g.key === term);
  if (!entry) return <span>{text}</span>;
  return (
    <span className={"gls" + (open ? " gls-open" : "")}>
      <button type="button" className="gls-term" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{text}</button>
      {open && (
        <span className="gls-pop" role="note">
          <span className="gls-name"><Inlines nodes={entry.nameInlines} /></span>
          <span className="gls-desc"><Inlines nodes={entry.description} /></span>
          <Link to={`/glossary#g-${encodeURIComponent(entry.key)}`} className="gls-link">Glossary</Link>
        </span>
      )}
    </span>
  );
}
