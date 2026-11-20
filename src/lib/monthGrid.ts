// A month as a calendar on the wall shows it: whole weeks, Sunday to Saturday. A month is
// 'YYYY-MM' and a date 'YYYY-MM-DD', both Susan's (src/lib/localTime.ts). Nothing here reads the
// machine's time zone.

import { addDays } from './localTime';

/** The month a date is in. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The month a number of months after another, or before it when the number is negative. */
export function addMonths(month: string, months: number): string {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + number - 1 + months;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * The weeks a month's grid shows, Sunday first: every week holding one of its days, each filled
 * out with days from the months either side.
 */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const [year, number] = month.split('-').map(Number);
  const sunday = addDays(first, -new Date(Date.UTC(year, number - 1, 1)).getUTCDay());
  const weeks: string[][] = [];
  for (let start = sunday; monthOf(start) <= month; start = addDays(start, 7))
    weeks.push(Array.from({ length: 7 }, (_, day) => addDays(start, day)));
  return weeks;
}

const MONTH = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** A month in words: "November 2026". */
export function formatMonth(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return MONTH.format(new Date(Date.UTC(year, number - 1, 1)));
}
