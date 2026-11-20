// What a backend function may say about a failure in its logs: what broke and where, and never
// Susan's number or the words of a text. Errors from the data API or a text sender can quote what
// they were sent, so quoted words and anything that looks like a phone number are blanked out.

/** Runs of seven or more digits, with the spaces and marks people write numbers with. */
const NUMBER = /\+?\d[\d\s().-]{5,}\d/g;
/** Anything in quotes. */
const QUOTED = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|“[^”]*”/g;

/** A failure as the logs may show it. */
export function describeError(error: unknown): string[] {
  const e = error instanceof Error ? error : null;
  const blank = (words: string) => words.replace(QUOTED, '"…"').replace(NUMBER, '#');
  return [
    e?.name ?? 'Unknown error',
    blank(e?.message ?? '').slice(0, 300),
    blank(e?.stack?.split('\n').slice(1, 6).join(' | ') ?? ''),
  ];
}
