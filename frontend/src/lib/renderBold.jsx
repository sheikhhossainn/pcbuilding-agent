// The engine marks part names with **bold** in its warnings; show them as bold text, not asterisks.
export function renderBold(text) {
  return String(text).split(/\*\*(.+?)\*\*/g).map((chunk, i) => (
    i % 2 === 1 ? <strong key={i} className="font-semibold">{chunk}</strong> : chunk
  ));
}
