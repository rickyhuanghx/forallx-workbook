import { useId, useMemo, useRef } from "react";
import { tryParse } from "../logic/parser";
import { toLatex, toUnicode } from "../logic/print";
import { Math } from "../render/Math";

export const SYMBOLS: Record<string, string[]> = {
  tfl: ["¬", "∧", "∨", "→", "↔", "⊥", "(", ")"],
  fol: ["¬", "∧", "∨", "→", "↔", "⊥", "∀", "∃", "=", "(", ")"],
  ml: ["¬", "∧", "∨", "→", "↔", "⊥", "□", "◇", "(", ")"],
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  logic?: "tfl" | "fol" | "ml";
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
}

/** Text field for a formula, with a symbol palette and a live typeset preview. */
export function FormulaInput({ value, onChange, logic = "tfl", placeholder, onEnter, autoFocus, compact, disabled, strict, label, invalid, noPalette, onFocus, normalizeOnBlur }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  const parsed = useMemo(() => (value.trim() ? tryParse(value, { strict }) : null), [value, strict]);

  const insert = (s: string) => {
    const el = ref.current;
    if (!el) { onChange(value + s); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + s + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + s.length, start + s.length); });
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
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }}
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
        {!noPalette && <div className="palette" role="toolbar" aria-label="Symbols">
          {SYMBOLS[logic].map((s) => (
            <button type="button" key={s} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(s)} disabled={disabled} aria-label={`Insert ${s}`}>{s}</button>
          ))}
        </div>}
      </div>
      {!compact && (
        <div className="finput-preview" aria-live="polite">
          {parsed?.ok ? <Math latex={toLatex(parsed.f)} /> : parsed ? <span className="finput-err">{parsed.error}</span> : <span className="finput-hint">Type with the keyboard aliases (~ &amp; v -&gt; &lt;-&gt; @x 3x) or the buttons.</span>}
        </div>
      )}
    </div>
  );
}
