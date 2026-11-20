import { afterEach, describe, expect, it, vi } from 'vitest';
import { failureKind } from '../../src/lib/failure';
import { logFailure } from './log';

/** An error that repeats, unquoted, what it was sent: a number and a text's words. */
const leaky = () =>
  new Error(
    "Could not send Susan's Calendar: Eye exam with Dr. Chen, tomorrow at 3:30 pm to +1 555 555 0123",
  );

afterEach(() => vi.restoreAllMocks());

describe('what a failure says in the logs', () => {
  it('names only the operation and the kind of failure, never what the error says', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(logFailure('Texts run', leaky())).toBe('Texts run failed (unknown)');
    const words = logged.mock.calls.flat().join(' ');
    expect(words).toBe('Texts run failed (unknown)');
    expect(words).not.toMatch(/555|Eye exam|Chen/);
  });

  it('tells the kinds of failure apart', () => {
    expect(failureKind(new TypeError('x is undefined'))).toBe('code');
    expect(
      failureKind({ errors: [{ errorType: 'DynamoDB:ConditionalCheckFailedException' }] }),
    ).toBe('condition');
    expect(
      failureKind({ errors: [{ errorType: 'Unauthorized', message: 'Not Authorized' }] }),
    ).toBe('access');
    expect(failureKind(new Error('connect ECONNRESET 10.0.0.1:443'))).toBe('network');
    expect(failureKind(new Error('Task timed out after 50.00 seconds'))).toBe('timeout');
    expect(failureKind({ errors: [{ message: 'Something odd' }] })).toBe('data');
    expect(failureKind('+15555550123')).toBe('unknown');
    expect(failureKind(null)).toBe('unknown');
  });
});
