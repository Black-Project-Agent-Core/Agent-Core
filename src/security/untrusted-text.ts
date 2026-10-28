/**
 * Text from outside the project (plugin manifests, recalled notes, OAuth client names) that a model or a person
 * will read. Removes what cannot be seen but changes what is read or shown: control and format characters
 * (zero-width, bidi overrides, soft hyphen, tag characters), variation selectors that are not emoji presentation,
 * blank-looking letters and runs of stacked combining marks. Pure; it neither blocks nor judges the text.
 */

const MAX_STACKED_MARKS = 3;
const BLANK_LETTERS = /[ᅟᅠㅤﾠ⠀]/u;
const VARIATION_SELECTOR = /[︀-️\u{E0100}-\u{E01EF}]/u;
const EMOJI_BASE = /[\p{Extended_Pictographic}0-9#*]/u;
const EMOJI_PART = /[\p{Extended_Pictographic}\p{Emoji_Modifier}]/u;
const JOINING_SCRIPTS = new RegExp('[' + [
  'Arabic', 'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu',
  'Kannada', 'Malayalam', 'Sinhala', 'Khmer', 'Myanmar',
].map(script => `\\p{Script_Extensions=${script}}`).join('') + ']', 'u'); // extensions: Arabic marks are Script=Inherited

function keepJoiner(joiner: string, previous: string | undefined, next: string | undefined): boolean {
  if (!previous || !next) return false;
  // ZWNJ shapes Persian, Indic and similar scripts; ZWJ builds emoji and Indic conjuncts. Between Latin letters
  // either one only hides a keyword from a reader or a filter.
  if (joiner === '‌') return JOINING_SCRIPTS.test(previous) && JOINING_SCRIPTS.test(next);
  const joins = (point: string) => EMOJI_PART.test(point) || JOINING_SCRIPTS.test(point);
  return joins(previous) && joins(next);
}

/** Code points with whitespace as ' ' (or '\n' when kept); invisible characters dropped. */
function clean(value: string, keepNewlines: boolean): string[] {
  const points = Array.from(value.normalize('NFC'));
  const kept: string[] = [];
  let marks = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    if (/\s/u.test(point)) {
      kept.push(keepNewlines && point === '\n' ? '\n' : ' ');
      marks = 0;
    } else if (point === '‌' || point === '‍') {
      if (keepJoiner(point, kept.at(-1), points[index + 1])) kept.push(point);
    } else if (point === '️') {
      if (EMOJI_BASE.test(kept.at(-1) ?? '')) kept.push(point);
    } else if (/[\p{Cc}\p{Cf}\p{Cs}\p{Co}]/u.test(point) || VARIATION_SELECTOR.test(point) || BLANK_LETTERS.test(point)) {
      continue;
    } else if (/\p{M}/u.test(point)) {
      marks += 1;
      if (marks <= MAX_STACKED_MARKS) kept.push(point);
    } else {
      marks = 0;
      kept.push(point);
    }
  }
  return kept;
}

/** Runs of spaces become one space; runs of newlines become at most one blank line; the ends are trimmed. */
function collapse(points: string[]): string[] {
  const out: string[] = [];
  let spaces = false;
  let newlines = 0;
  for (const point of points) {
    if (point === ' ') { spaces = true; continue; }
    if (point === '\n') { newlines += 1; continue; }
    if (out.length > 0) {
      if (newlines > 0) out.push(...'\n'.repeat(Math.min(newlines, 2)));
      else if (spaces) out.push(' ');
    }
    spaces = false;
    newlines = 0;
    out.push(point);
  }
  return out;
}

function limit(points: string[], max: number): string {
  if (points.length <= max) return points.join('');
  return `${points.slice(0, max).join('').trimEnd()} [+${points.length - max} chars]`;
}

/** Several lines allowed (at most one blank line in a row); everything else as in `oneLineLabel`. */
export function neutralizeUntrustedText(value: unknown, max = 2_000): string {
  if (typeof value !== 'string') return '';
  return limit(collapse(clean(value, true)), max);
}

/** One line: all whitespace folds to single spaces. Cut by code point, never inside a surrogate pair. */
export function oneLineLabel(value: unknown, max = 120): string {
  if (typeof value !== 'string') return '';
  return limit(collapse(clean(value, false)), max);
}
