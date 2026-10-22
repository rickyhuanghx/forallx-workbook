import { useLayoutEffect, useRef, useState } from "react";
import type { Block } from "../content/types";
import { applyShortcuts, type ShortLogic } from "../logic/shortcuts";
import { recordExercise, useProgress } from "../state/progress";
import { Palette, insertAtCaret } from "./FormulaInput";
import { MarkDone, Solution } from "./Solution";

/** Written answer: a notes box with symbol shortcuts, the book's solution when it exists, and a self-mark. */
export function FreeResponse({ exerciseId, solution, chapterId, logic = "tfl" }: { exerciseId: string; solution?: Block[]; chapterId?: string; logic?: ShortLogic }) {
  const [progress] = useProgress();
  const rec = progress.exercises[exerciseId];
  const [text, setText] = useState(rec?.answer ?? "");
  const [open, setOpen] = useState(!!rec?.answer);
  const done = rec?.status === "done" || rec?.status === "correct";
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pendingCaret.current != null) {
      const c = pendingCaret.current;
      pendingCaret.current = null;
      el.setSelectionRange(c, c);
    }
  });

  const save = (t: string) => { if (t !== (rec?.answer ?? "")) recordExercise(exerciseId, { status: done ? rec!.status : "attempted", answer: t }); };

  return (
    <div className="widget widget-free">
      {open ? (
        <>
          <textarea ref={ref} className="notes" value={text} placeholder="Write your answer here (kept in this browser)" rows={3}
            spellCheck={false} autoCapitalize="off" autoCorrect="off"
            onChange={(e) => {
              const el = e.target;
              const r = applyShortcuts(el.value, el.selectionStart ?? el.value.length, logic, true);
              if (r.text !== el.value) pendingCaret.current = r.caret;
              setText(r.text);
            }}
            onBlur={() => save(text)} />
          <Palette logic={logic} className="free-palette" onInsert={(s) => { const r = insertAtCaret(ref.current, text, s); pendingCaret.current = r.caret; setText(r.text); ref.current?.focus(); }} />
        </>
      ) : (
        <button type="button" className="linkish" onClick={() => setOpen(true)}>Write an answer</button>
      )}
      <div className="widget-actions">
        <MarkDone done={done} onChange={(d) => recordExercise(exerciseId, { status: d ? "done" : "attempted", answer: text })} />
      </div>
      {solution && <Solution blocks={solution} chapterId={chapterId} onReveal={() => { if (!done) recordExercise(exerciseId, { status: "revealed", answer: text }); }} />}
    </div>
  );
}
