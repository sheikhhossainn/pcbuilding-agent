/**
 * Which kept parts can stay kept, given which others are kept.
 *
 * A board is chosen for its CPU and memory for its board, and the PSU is sized for the CPU and the
 * graphics card. So a part can only stay as it is while every part it depends on stays too. Used by
 * refines (parts kept from the previous build) and by cross-checks (parts matched at another store).
 */

/** category -> the parts it was chosen for */
export const DEPENDS_ON = {
  Motherboard: ['Processor'],
  RAM: ['Motherboard'],
  PSU: ['Processor', 'Graphics Card'],
};

/**
 * Drop every kept part whose dependencies are not all kept. Mutates and returns `locks`.
 * @param {Set<string>} locks - categories kept as they are
 * @param {{ noGpu?: boolean }} [opts] - a build without a graphics card sizes the PSU on the CPU alone
 * @returns {Set<string>}
 */
export function applyLockCascade(locks, { noGpu = false } = {}) {
  if (!locks.has('Processor')) {
    locks.delete('Motherboard');
    locks.delete('RAM');
  } else if (!locks.has('Motherboard')) {
    locks.delete('RAM');
  }
  if (!locks.has('Processor') || (!locks.has('Graphics Card') && !noGpu)) {
    locks.delete('PSU');
  }
  return locks;
}
