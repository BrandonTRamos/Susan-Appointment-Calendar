// What a backend function may say when something fails where Susan's number or the words of a text
// could be involved: the operation, from a fixed list, and the kind of failure (src/lib/failure.ts).
// Never the error's message, its stack or its cause, which can quote what it was sent.

import { failureKind } from '../../src/lib/failure';

/** Logs that the operation failed, and how, in fixed words. Answers the words it logged. */
export function logFailure(what: string, error: unknown): string {
  const said = `${what} failed (${failureKind(error)})`;
  console.error(said);
  return said;
}
