import { useState } from "react";
import type { Block } from "../content/types";
import { recordExercise, useProgress } from "../state/progress";
import { MarkDone, Solution } from "./Solution";

/** Written answer: a notes box, the book's solution when it exists, and a self-mark. */
export function FreeResponse({ exerciseId, solution, chapterId }: { exerciseId: string; solution?: Block[]; chapterId?: string }) {
  const [progress] = useProgress();
  const rec = progress.exercises[exerciseId];
  const [text, setText] = useState(rec?.answer ?? "");
  const [open, setOpen] = useState(!!rec?.answer);
  const done = rec?.status === "done" || rec?.status === "correct";
  return (
    <div className="widget widget-free">
      {open ? (
        <textarea className="notes" value={text} placeholder="Write your answer here (kept in this browser)" rows={3}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => { if (text !== (rec?.answer ?? "")) recordExercise(exerciseId, { status: done ? rec!.status : "attempted", answer: text }); }} />
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
