/** A progress meter: a filled track with the count written beside it, so the bar is never the only cue. */
export function Meter({ value, max, label, unit, compact }: { value: number; max: number; label: string; unit?: string; compact?: boolean }) {
  const v = Math.max(0, Math.min(value, max));
  const pct = max > 0 ? Math.round((v / max) * 100) : 0;
  const text = unit ? `${v} of ${max} ${unit}` : `${v} of ${max}`;
  return (
    <span className={"meter" + (compact ? " meter-compact" : "") + (max > 0 && v >= max ? " is-full" : "") + (v === 0 ? " is-empty" : "")}>
      <span className="meter-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={v} aria-valuetext={text}>
        <span className="meter-fill" style={{ width: pct + "%" }} />
      </span>
      <span className="meter-num">{text}</span>
    </span>
  );
}
