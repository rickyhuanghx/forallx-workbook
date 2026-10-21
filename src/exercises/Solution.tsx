import { useState } from "react";
import type { Block } from "../content/types";
import { Blocks } from "../render/Blocks";

/** Collapsible panel showing the book's solution. */
export function Solution({ blocks, chapterId, label = "Show the book's solution", onReveal }: { blocks: Block[]; chapterId?: string; label?: string; onReveal?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"solution" + (open ? " is-open" : "")}>
      <button type="button" className="sol-toggle" aria-expanded={open} onClick={() => { setOpen((o) => !o); if (!open) onReveal?.(); }}>
        {open ? "Hide the solution" : label}
      </button>
      {open && <div className="sol-body prose"><Blocks blocks={blocks} chapterId={chapterId} /></div>}
    </div>
  );
}

export function MarkDone({ done, onChange }: { done: boolean; onChange: (d: boolean) => void }) {
  return (
    <label className="mark-done">
      <input type="checkbox" checked={done} onChange={(e) => onChange(e.target.checked)} />
      <span>{done ? "Done" : "Mark as done"}</span>
    </label>
  );
}

export function Verdict({ state, children }: { state: "ok" | "near" | "bad" | "info" | null; children: React.ReactNode }) {
  if (!state) return null;
  return <div className={`verdict verdict-${state}`} role="status">{children}</div>;
}
