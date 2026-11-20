// How a screen test renders the whole app: at a chosen width, at an address, on a sample calendar.

import { render } from '@testing-library/react';
import { App, type AppProps } from '../App';
import { createSampleCalendar, type SampleCalendar } from '../data/sampleCalendar';
import type { Actor } from '../lib/calendar';
import { addDays, today } from '../lib/localTime';
import { DESKTOP_WIDTH } from '../lib/useDesktopWidth';

/** Susan's time zone in screen tests. The tests themselves run in Pacific/Auckland. */
export const EASTERN = 'America/New_York';

/** Other people, for changes a test makes behind the screen's back. */
export const linda: Actor = { person: { id: 'person-linda', name: 'Linda' }, viaAgent: false };
export const mark: Actor = { person: { id: 'person-mark', name: 'Mark' }, viaAgent: false };

/** Renders at a phone or desktop width: jsdom has no layout, so the width query is answered here. */
export function atWidth(width: 'phone' | 'desktop') {
  window.matchMedia = (query: string) =>
    ({
      matches: width === 'desktop' && query === DESKTOP_WIDTH,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
}

/** Susan's date a number of days from today, 'YYYY-MM-DD'. */
export const daysFromToday = (days: number) => addDays(today(EASTERN, new Date()), days);

/** A calendar with no Appointments, on the sample-data store. */
export const emptyCalendar = () => createSampleCalendar(EASTERN, { empty: true });

export function renderApp(
  path = '/',
  { calendar = emptyCalendar(), ...props }: Partial<AppProps> & { calendar?: SampleCalendar } = {},
) {
  window.history.pushState({}, '', path);
  const view = render(
    <App displayName="Linda" timeZone={EASTERN} calendar={calendar} {...props} />,
  );
  return { ...view, calendar };
}
