// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSampleCalendar } from '../data/sampleCalendar';
import { createFixedClock } from '../lib/calendar';
import { atWidth, daysFromToday, EASTERN, linda, renderApp } from '../test/renderApp';

const realMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

/**
 * A sample calendar with one Appointment in three days, run at the moment its Reminder fell due,
 * with Susan's number set or not, and the Reminder refused when `refuse` says so.
 */
async function calendarWithDueReminder({
  susansNumber = '+15555550123' as string | null,
  refuse = false,
} = {}) {
  const clock = createFixedClock(new Date().toISOString());
  const calendar = createSampleCalendar(EASTERN, { empty: true, clock, susansNumber });
  await calendar.settings();
  const added = await calendar.core.addAppointment(linda, {
    what: 'Eye exam',
    date: daysFromToday(3),
    time: '15:30',
  });
  clock.set(added.reminders[0].dueAt);
  if (refuse) calendar.sender.refuseNext();
  await calendar.core.runDue();
  return { calendar, added, clock };
}

const banner = () => screen.findByRole('alert');

describe.each(['phone', 'desktop'] as const)('the banner about texts, at %s width', (width) => {
  beforeEach(() => atWidth(width));

  it('shows on every screen while the most recent text to Susan failed', async () => {
    const { calendar, added } = await calendarWithDueReminder({ refuse: true });
    for (const path of ['/', '/month', '/settings', `/appointments/${added.id}`]) {
      renderApp(path, { calendar });
      expect(await banner()).toHaveTextContent('The last text to Susan, a Reminder, failed.');
      expect(screen.getByRole('link', { name: 'See the text' })).toHaveAttribute(
        'href',
        `/appointments/${added.id}`,
      );
      cleanup();
    }
  });

  it('clears once a later text to Susan goes', async () => {
    const { calendar, clock } = await calendarWithDueReminder({ refuse: true });
    renderApp('/', { calendar });
    expect(await banner()).toHaveTextContent(/failed/);
    clock.set(new Date(clock.now().getTime() + 60_000).toISOString());
    await act(() => calendar.core.sendTestText(linda));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('says plainly when no texts are going to Susan because her number is not set', async () => {
    const { calendar } = await calendarWithDueReminder({ susansNumber: null });
    renderApp('/', { calendar });
    expect(await banner()).toHaveTextContent(
      'No texts are going to Susan: her mobile number is not set in Settings.',
    );
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('does not show while texts to Susan are going', async () => {
    const { calendar } = await calendarWithDueReminder();
    renderApp('/', { calendar });
    expect((await screen.findAllByText('Eye exam')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
