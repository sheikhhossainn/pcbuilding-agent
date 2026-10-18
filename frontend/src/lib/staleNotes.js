/**
 * Notes the engine writes about the build it just made, which stop being true the moment the user
 * swaps, removes or adds a part by hand: money left unspent, a named price that was not met,
 * a part that could not be found. After a manual edit they are dropped instead of left to
 * describe a build that no longer exists. Compatibility warnings are re-run on the server, not here.
 */
const BUILD_STATE_NOTES = [
  /of your budget is unspent because the parts you kept/,
  /^You asked for a .+ around [\d,]+ BDT; the closest that fit/,
  /^Could not find a suitable /,
];

export function isBuildStateNote(note) {
  const text = String(note ?? '').replace(/\*\*/g, '');
  return BUILD_STATE_NOTES.some((re) => re.test(text));
}

/** The notes that are still true after a manual edit. */
export function keepLastingNotes(notes) {
  return (notes || []).filter((note) => !isBuildStateNote(note));
}
