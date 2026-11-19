import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME_ZONE, resolveTimeZone, timeZoneName } from './timeZone';

describe("Susan's time zone", () => {
  it('is US Eastern when nothing is configured', () => {
    expect(DEFAULT_TIME_ZONE).toBe('America/New_York');
    expect(resolveTimeZone(undefined)).toBe('America/New_York');
    expect(resolveTimeZone('')).toBe('America/New_York');
    expect(resolveTimeZone('   ')).toBe('America/New_York');
  });

  it('is the configured zone when one is set', () => {
    expect(resolveTimeZone('America/Chicago')).toBe('America/Chicago');
    expect(resolveTimeZone(' America/Denver ')).toBe('America/Denver');
  });

  it('refuses a value that is not a time zone, so a typo cannot shift every Appointment', () => {
    expect(() => resolveTimeZone('Eastern')).toThrow(/SUSAN_TIME_ZONE/);
    expect(() => resolveTimeZone('America/New York')).toThrow(/America\/New_York/);
  });

  it('never comes from the machine running the code', () => {
    // vite.config.ts runs the tests in Pacific/Auckland.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe('America/New_York');
    expect(resolveTimeZone(undefined)).toBe('America/New_York');
  });

  it('has a plain name for people to read', () => {
    expect(timeZoneName('America/New_York')).toBe('Eastern Time');
    expect(timeZoneName('America/Chicago')).toBe('Central Time');
  });
});
