// Technical backdrop: a faint blueprint grid with data pulses travelling along its lines.
// Pure CSS (transform/opacity only), decorative, stopped by reduced-motion and print.
const H_TRACES = [3, 7, 11, 15];
const V_TRACES = [6, 18, 29];

export default function AmbientBackground() {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="ambient-glow" />
      <div className="ambient-field">
        <span className="ambient-grid" />
        {H_TRACES.map((row, i) => (
          <span
            key={`h${row}`}
            className="ambient-trace ambient-trace-h"
            style={{ top: `calc(var(--cell) * ${row})`, animationDelay: `${-i * 4.3}s`, animationDuration: `${13 + i * 2}s` }}
          />
        ))}
        {V_TRACES.map((col, i) => (
          <span
            key={`v${col}`}
            className="ambient-trace ambient-trace-v"
            style={{ left: `calc(var(--cell) * ${col})`, animationDelay: `${-i * 5.1}s`, animationDuration: `${15 + i * 3}s` }}
          />
        ))}
      </div>
    </div>
  );
}
