import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { tryParse } from "../logic/parser";
import { toLatex, toUnicode } from "../logic/print";
import { applyShortcuts, shortcutLegend, type ShortLogic } from "../logic/shortcuts";
import { Math } from "../render/Math";

export const SYMBOLS: Record<string, string[]> = {
  tfl: ["¬", "∧", "∨", "→", "↔", "⊥", "(", ")"],
  fol: ["¬", "∧", "∨", "→", "↔", "⊥", "∀", "∃", "=", "(", ")"],
  ml: ["¬", "∧", "∨", "→", "↔", "⊥", "□", "◇", "(", ")"],
};

/** Insert `s` at the caret of a text field and return the new value and caret. */
export function insertAtCaret(el: HTMLInputElement | HTMLTextAreaElement | null, value: string, s: string): { text: string; caret: number } {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  return { text: value.slice(0, start) + s + value.slice(end), caret: start + s.length };
}

/** The "?" button and the legend of typing shortcuts. Renders inside a flex-wrap palette; the legend takes a full row. */
export function SymbolHelp({ logic, open: openProp, onToggle }: { logic: ShortLogic; open?: boolean; onToggle?: () => void }) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const toggle = onToggle ?? (() => setOwn((o) => !o));
  return (
    <>
      {/* reachable with Tab (the symbol buttons are not), so keyboard users can open the legend from any box,
          including written-answer boxes where "?" is typed as text; Escape on it closes the legend */}
      <button type="button" className="help-btn" onMouseDown={(e) => e.preventDefault()} onClick={toggle}
        onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); toggle(); } }}
        aria-expanded={open} aria-label="Typing shortcuts" title="Typing shortcuts (or press ? in a formula box)">?</button>
      {open && (
        <div className="shortcut-help" role="note">
          <p>Type these and they turn into symbols as you go. Buttons and pasted ASCII work too.</p>
          <dl>
            {shortcutLegend(logic).map(([sym, how]) => (
              <div key={sym}><dt>{sym}</dt><dd>{how}</dd></div>
            ))}
          </dl>
          <p>LaTeX names also convert when you type the next character: \neg \wedge \vee \to \iff \forall \exists{logic === "ml" ? " \\Box \\Diamond" : ""}.</p>
        </div>
      )}
    </>
  );
}

/** Symbol buttons for a logic, plus the help toggle. */
export function Palette({ logic, onInsert, disabled, className, extra, helpOpen, onHelpToggle }: { logic: ShortLogic; onInsert: (s: string) => void; disabled?: boolean; className?: string; extra?: React.ReactNode; helpOpen?: boolean; onHelpToggle?: () => void }) {
  return (
    <div className={"palette" + (className ? " " + className : "")} role="toolbar" aria-label="Symbols">
      {SYMBOLS[logic].map((s) => (
        <button type="button" key={s} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(s)} disabled={disabled} aria-label={`Insert ${s}`}>{s}</button>
      ))}
      {extra}
      <SymbolHelp logic={logic} open={helpOpen} onToggle={onHelpToggle} />
    </div>
  );
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  logic?: ShortLogic;
  placeholder?: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  compact?: boolean;      // no preview line (used inside the proof editor)
  disabled?: boolean;
  strict?: boolean;
  label?: string;
  invalid?: boolean;
  noPalette?: boolean;
  onFocus?: () => void;
  normalizeOnBlur?: boolean;   // rewrite the text in the book's notation once it parses
  onHelp?: () => void;         // with noPalette: what a typed "?" does (the owner's palette shows the legend)
  helpOpen?: boolean;          // with onHelp: whether the owner's legend is open, so Escape can close it
}

/** Text field for a formula, with live typing shortcuts, a symbol palette and a typeset preview. */
export function FormulaInput({ value, onChange, logic = "tfl", placeholder, onEnter, autoFocus, compact, disabled, strict, label, invalid, noPalette, onFocus, normalizeOnBlur, onHelp, helpOpen }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [help, setHelp] = useState(false);
  const toggleHelp = onHelp ?? (() => setHelp((o) => !o));
  const pendingCaret = useRef<number | null>(null);
  const id = useId();
  const parsed = useMemo(() => (value.trim() ? tryParse(value, { strict, logic }) : null), [value, strict, logic]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pendingCaret.current != null) {
      const c = pendingCaret.current;
      pendingCaret.current = null;
      el.setSelectionRange(c, c);
    }
  });

  const insert = (s: string) => {
    const r = insertAtCaret(ref.current, value, s);
    pendingCaret.current = r.caret;
    onChange(r.text);
    ref.current?.focus();
  };

  const handleChange = (el: HTMLInputElement) => {
    const r = applyShortcuts(el.value, el.selectionStart ?? el.value.length, logic);
    if (r.text !== el.value) pendingCaret.current = r.caret;
    onChange(r.text);
  };

  return (
    <div className={"finput" + (compact ? " finput-compact" : "")}>
      <div className="finput-row">
        <input
          ref={ref}
          id={id}
          className={"finput-text" + (invalid || (parsed && !parsed.ok && !compact) ? " is-invalid" : "")}
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); }
            // "?" is never part of a formula: it opens the typing legend instead of landing in the box
            else if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggleHelp(); }
            else if (e.key === "Escape" && (onHelp ? helpOpen : help)) { e.preventDefault(); toggleHelp(); }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={label ?? "Formula"}
          aria-invalid={!!(parsed && !parsed.ok)}
          onFocus={onFocus}
          onBlur={() => { if (normalizeOnBlur && parsed?.ok) { const u = toUnicode(parsed.f); if (u !== value) onChange(u); } }}
        />
        {!noPalette && <Palette logic={logic} onInsert={insert} disabled={disabled} helpOpen={help} onHelpToggle={toggleHelp} />}
      </div>
      {!compact && (
        <div className="finput-preview" aria-live="polite">
          {parsed?.ok ? <Math latex={toLatex(parsed.f)} /> : parsed ? <span className="finput-err">{parsed.error}</span> : <span className="finput-hint">Type ~ &amp; -&gt; &lt;-&gt;{logic === "fol" ? " Ax Ex" : logic === "ml" ? " [] <>" : ""} and they become symbols, or use the buttons. Press ? for the full list.</span>}
        </div>
      )}
    </div>
  );
}
