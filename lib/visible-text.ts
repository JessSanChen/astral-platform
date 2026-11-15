/**
 * Whether a piece of text has anything in it a person could see.
 *
 * A reply can come back holding only characters that draw nothing: a
 * zero-width space, a word joiner, a soft hyphen, a byte-order mark. It
 * is not an empty string, so it used to be drawn as a reply, and showed as
 * a bubble with nothing in it and no word of explanation. For the screen,
 * that is an empty reply and is said to be one.
 *
 * The characters are given by number, not written out, so that this file
 * does not itself contain invisible characters.
 */
const INVISIBLE: (number | [number, number])[] = [
  0x00ad, // soft hyphen
  0x034f, // combining grapheme joiner
  0x061c, // Arabic letter mark
  [0x115f, 0x1160], // Hangul fillers
  [0x17b4, 0x17b5], // Khmer inherent vowels
  [0x180b, 0x180e], // Mongolian separators
  [0x200b, 0x200f], // zero-width space, joiners, direction marks
  [0x2028, 0x202f], // line and paragraph separators, direction controls
  [0x2060, 0x206f], // word joiner, invisible operators
  0x3164, // Hangul filler
  [0xfe00, 0xfe0f], // variation selectors
  0xfeff, // byte-order mark
  0xffa0, // halfwidth Hangul filler
];

function draws(character: string) {
  if (/\s/.test(character)) return false;
  const code = character.codePointAt(0) ?? 0;
  // Control characters draw nothing either.
  if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false;
  return !INVISIBLE.some((entry) =>
    typeof entry === "number" ? entry === code : code >= entry[0] && code <= entry[1],
  );
}

export function hasVisibleText(text: string | null | undefined) {
  for (const character of text ?? "") {
    if (draws(character)) return true;
  }
  return false;
}
