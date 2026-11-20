import { describe, expect, it } from 'vitest';
import { addMonths, formatMonth, monthOf, monthWeeks } from './monthGrid';

describe('the month grid', () => {
  it('runs Sunday to Saturday in whole weeks, with the neighbouring months filling the ends', () => {
    const weeks = monthWeeks('2026-11');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ]);
    expect(weeks[4]).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
    ]);
  });

  it('starts in the month before when the first is not a Sunday', () => {
    const weeks = monthWeeks('2027-01');
    expect(weeks[0][0]).toBe('2026-12-27');
    expect(weeks[0][5]).toBe('2027-01-01');
    expect(weeks.at(-1)!.at(-1)).toBe('2027-02-06');
  });

  it('takes six weeks when the month needs them, and four when it fits', () => {
    expect(monthWeeks('2026-08')).toHaveLength(6);
    expect(monthWeeks('2026-02')).toHaveLength(4);
  });

  it('moves between months across the turn of a year', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', 14)).toBe('2028-01');
  });

  it('names a month and finds the month of a date', () => {
    expect(formatMonth('2026-11')).toBe('November 2026');
    expect(monthOf('2026-11-19')).toBe('2026-11');
  });
});
