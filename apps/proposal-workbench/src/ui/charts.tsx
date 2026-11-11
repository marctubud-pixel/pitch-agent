/** Small, dependency-free charts. Every chart also shows its numbers as text. */

/** Small progress ring: supported claims out of all claims. */
export function Ring({ value, total, size = 88 }: { value: number; total: number; size?: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const share = total ? value / total : 0;
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden="true">
        <circle cx="40" cy="40" r={r} className="ring__track" />
        <circle cx="40" cy="40" r={r} className="ring__value" strokeDasharray={`${c * share} ${c}`} transform="rotate(-90 40 40)" />
      </svg>
      <span className="ring__text">
        {value}
        <small>/{total}</small>
      </span>
    </span>
  );
}
