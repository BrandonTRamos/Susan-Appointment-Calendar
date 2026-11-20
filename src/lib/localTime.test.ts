import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateParts,
  dayInWords,
  formatDate,
  formatMoment,
  formatTime,
  isDate,
  isTime,
  localDateTime,
  momentOf,
  momentOrSkipped,
  today,
} from './localTime';

const EASTERN = 'America/New_York';

describe("Susan's local time", () => {
  it('is worked out far from the machine running the code', () => {
    // vite.config.ts runs the tests in Pacific/Auckland.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe(EASTERN);
  });

  it('knows a real date and a real time from words that only look like one', () => {
    expect(isDate('2026-11-20')).toBe(true);
    expect(isDate('2028-02-29')).toBe(true);
    expect(isDate('2026-02-29')).toBe(false);
    expect(isDate('2026-13-01')).toBe(false);
    expect(isDate('11/20/2026')).toBe(false);
    expect(isTime('00:00')).toBe(true);
    expect(isTime('23:59')).toBe(true);
    expect(isTime('24:00')).toBe(false);
    expect(isTime('9:30')).toBe(false);
    expect(isTime('09:60')).toBe(false);
  });

  it('finds the moment a date and time happen, in winter and in summer', () => {
    expect(momentOf('2026-11-20', '14:30', EASTERN)?.toISOString()).toBe(
      '2026-11-20T19:30:00.000Z',
    );
    expect(momentOf('2026-07-04', '14:30', EASTERN)?.toISOString()).toBe(
      '2026-07-04T18:30:00.000Z',
    );
    expect(momentOf('2026-11-20', '14:30', 'America/Chicago')?.toISOString()).toBe(
      '2026-11-20T20:30:00.000Z',
    );
  });

  it('has no moment for a time the clocks skip when they go forward', () => {
    // US Eastern, 14 March 2027: 1:59 am is followed by 3:00 am.
    expect(momentOf('2027-03-14', '01:59', EASTERN)?.toISOString()).toBe(
      '2027-03-14T06:59:00.000Z',
    );
    expect(momentOf('2027-03-14', '02:00', EASTERN)).toBeNull();
    expect(momentOf('2027-03-14', '02:30', EASTERN)).toBeNull();
    expect(momentOf('2027-03-14', '03:00', EASTERN)?.toISOString()).toBe(
      '2027-03-14T07:00:00.000Z',
    );
  });

  it('can read a time the clocks skip as the same time an hour later', () => {
    expect(momentOrSkipped('2027-03-14', '02:30', EASTERN).toISOString()).toBe(
      '2027-03-14T07:30:00.000Z',
    );
    expect(momentOrSkipped('2027-03-14', '01:30', EASTERN).toISOString()).toBe(
      '2027-03-14T06:30:00.000Z',
    );
  });

  it('takes the first of the two when the clocks repeat an hour going back', () => {
    // US Eastern, 1 November 2026: 1:59 am is followed by 1:00 am again.
    expect(momentOf('2026-11-01', '01:30', EASTERN)?.toISOString()).toBe(
      '2026-11-01T05:30:00.000Z',
    );
    expect(momentOf('2026-11-01', '02:00', EASTERN)?.toISOString()).toBe(
      '2026-11-01T07:00:00.000Z',
    );
  });

  it('reads a moment back as the date and time on her clock', () => {
    expect(localDateTime(new Date('2026-11-20T19:30:00Z'), EASTERN)).toEqual({
      date: '2026-11-20',
      time: '14:30',
    });
    // Just after midnight UTC is still the evening before for her.
    expect(localDateTime(new Date('2026-11-20T04:30:00Z'), EASTERN)).toEqual({
      date: '2026-11-19',
      time: '23:30',
    });
    expect(localDateTime(new Date('2026-11-20T05:00:00Z'), EASTERN).time).toBe('00:00');
  });

  it('counts today as her day, on both sides of a clock change', () => {
    expect(today(EASTERN, new Date('2027-03-14T04:59:00Z'))).toBe('2027-03-13');
    expect(today(EASTERN, new Date('2027-03-14T05:00:00Z'))).toBe('2027-03-14');
    // After the change her midnight is an hour earlier in UTC.
    expect(today(EASTERN, new Date('2027-03-15T03:59:00Z'))).toBe('2027-03-14');
    expect(today(EASTERN, new Date('2027-03-15T04:00:00Z'))).toBe('2027-03-15');
  });

  it('counts days along the calendar, across month ends and clock changes', () => {
    expect(addDays('2026-11-19', 1)).toBe('2026-11-20');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-13', 2)).toBe('2027-03-15');
    expect(addDays('2026-11-02', -2)).toBe('2026-10-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('writes dates, times and moments in words', () => {
    expect(formatDate('2026-11-20')).toBe('Friday, November 20, 2026');
    expect(formatDate('2026-11-20', 'short')).toBe('Fri, Nov 20, 2026');
    expect(formatDate('2026-11-20', 'noYear')).toBe('Friday, November 20');
    expect(formatTime('14:30')).toBe('2:30 pm');
    expect(formatTime('00:05')).toBe('12:05 am');
    expect(formatTime('12:00')).toBe('12:00 pm');
    expect(formatTime('09:00')).toBe('9:00 am');
    expect(formatMoment('2026-11-19T20:15:00Z', EASTERN)).toBe('Thu, Nov 19, 2026 at 3:15 pm');
  });
});

describe('a day in words', () => {
  it('says Today or Tomorrow, then the weekday and date', () => {
    expect(dayInWords('2026-11-19', '2026-11-19')).toBe('Today · Thu, Nov 19');
    expect(dayInWords('2026-11-20', '2026-11-19')).toBe('Tomorrow · Fri, Nov 20');
    expect(dayInWords('2026-12-31', '2026-12-30')).toBe('Tomorrow · Thu, Dec 31');
  });

  it('says only the weekday and date further ahead, with the year when it is not this one', () => {
    expect(dayInWords('2026-11-23', '2026-11-19')).toBe('Mon, Nov 23');
    expect(dayInWords('2027-01-01', '2026-12-31')).toBe('Tomorrow · Fri, Jan 1, 2027');
    expect(dayInWords('2027-01-04', '2026-12-31')).toBe('Mon, Jan 4, 2027');
  });
});

describe('the parts of a date', () => {
  it('are its weekday, month and day of the month', () => {
    expect(dateParts('2026-12-01')).toEqual({ weekday: 'Tue', month: 'Dec', day: '1' });
  });
});
