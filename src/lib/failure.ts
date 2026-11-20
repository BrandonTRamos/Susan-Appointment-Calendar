// What may be said about a failure where a number or a text's words could be in it: a fixed word
// for what kind of failure it was, worked out from the error but never quoting it. An error from
// the data API or a text sender can repeat what it was sent, quoted or not, so neither its message
// nor its stack is ever passed on. Shared by the calendar core and the backend's functions.

export const FAILURE_KINDS = [
  /** DynamoDB refused a write's condition. */
  'condition',
  'timeout',
  'network',
  /** Not allowed: credentials, permissions, sign-in. */
  'access',
  /** The data API, AppSync or DynamoDB answered with an error. */
  'data',
  /** A mistake in the code: a TypeError, RangeError and the like. */
  'code',
  'unknown',
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** Which kind of failure an error is. The error is read only to decide; none of it is returned. */
export function failureKind(error: unknown): FailureKind {
  const e = (typeof error === 'object' && error !== null ? error : {}) as {
    name?: unknown;
    message?: unknown;
    errorType?: unknown;
    errors?: unknown;
  };
  const inner = Array.isArray(e.errors) ? (e.errors as (typeof e)[]) : [];
  const said = [e, ...inner]
    .map(
      (each) =>
        `${String(each.name ?? '')} ${String(each.errorType ?? '')} ${String(each.message ?? '')}`,
    )
    .join(' ');
  if (/ConditionalCheckFailed/i.test(said)) return 'condition';
  if (/timed? ?out|timeout|ETIMEDOUT/i.test(said)) return 'timeout';
  if (/network|ECONN|ENOTFOUND|EAI_AGAIN|socket|fetch failed/i.test(said)) return 'network';
  if (/unauthori[sz]ed|forbidden|access ?denied|not authori[sz]ed|credential/i.test(said))
    return 'access';
  if (/graphql|appsync|dynamodb|data api/i.test(said) || inner.length > 0) return 'data';
  if (['TypeError', 'RangeError', 'ReferenceError', 'SyntaxError'].includes(String(e.name)))
    return 'code';
  return 'unknown';
}
