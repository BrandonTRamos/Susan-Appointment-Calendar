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
  block = false,
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
  if (block) calendar.sender.blockNext();
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

  it('says when the last text was not sent because her number was not set, and stays true once it is', async () => {
    const { calendar, clock } = await calendarWithDueReminder({ susansNumber: null });
    renderApp('/', { calendar });
    const words =
      'The last text to Susan, a Reminder, was not sent: her mobile number was not set in Settings.';
    expect(await banner()).toHaveTextContent(words);
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
    // Entering the number does not make it untrue: it is about that text. A test text clears it.
    await act(() => calendar.changeSettings({ susansNumber: '+15555550123' }));
    expect(await banner()).toHaveTextContent(words);
    expect(screen.queryByText(/is not set/)).toBeNull();
    clock.set(new Date(clock.now().getTime() + 60_000).toISOString());
    await act(() => calendar.core.sendTestText(linda));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('shows when a test text from Settings fails, and points to Settings', async () => {
    const { calendar, clock } = await calendarWithDueReminder();
    clock.set(new Date(clock.now().getTime() + 60_000).toISOString());
    calendar.sender.refuseNext();
    await calendar.core.sendTestText(linda);
    renderApp('/month', { calendar });
    expect(await banner()).toHaveTextContent('The last text to Susan, a test text, failed.');
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('says when the last text was not sent because its words held a web address', async () => {
    const clock = createFixedClock(new Date().toISOString());
    const calendar = createSampleCalendar(EASTERN, { empty: true, clock });
    await calendar.settings();
    const added = await calendar.core.addAppointment(linda, {
      what: 'Eye exam',
      date: daysFromToday(3),
      time: '15:30',
      noteForSusan: 'Directions at www.example.com',
    });
    clock.set(added.reminders[0].dueAt);
    await calendar.core.runDue();
    renderApp('/', { calendar });
    expect(await banner()).toHaveTextContent(
      'The last text to Susan, a Reminder, was not sent: its words held a web address.',
    );
    expect(screen.getByRole('link', { name: 'See the text' })).toHaveAttribute(
      'href',
      `/appointments/${added.id}`,
    );
  });

  const BLOCKED =
    "Texts to Susan are blocked: she opted out, so none reaches her phone. Only she can undo it, by replying START to a text from the calendar's number.";

  it('shows on every screen while texts to Susan are blocked, until a text is delivered again', async () => {
    const { calendar, added, clock } = await calendarWithDueReminder({ block: true });
    for (const path of ['/', '/replies', '/settings', `/appointments/${added.id}`]) {
      renderApp(path, { calendar });
      expect(await banner()).toHaveTextContent(BLOCKED);
      expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
        'href',
        '/settings',
      );
      cleanup();
    }
    renderApp('/', { calendar });
    // A later text that is only sent, not yet delivered, does not clear it.
    clock.set(new Date(clock.now().getTime() + 60_000).toISOString());
    const test = await act(() => calendar.core.sendTestText(linda));
    expect(await banner()).toHaveTextContent(BLOCKED);
    await act(() => calendar.core.recordDelivery({ textId: test.id, outcome: 'delivered' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('shows when the text sender reports that she opted out', async () => {
    const { calendar } = await calendarWithDueReminder();
    renderApp('/month', { calendar });
    expect((await screen.findAllByText('Eye exam')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
    await act(() => calendar.core.recordOptOut({ key: 'report-1' }));
    expect(await banner()).toHaveTextContent(BLOCKED);
  });

  it('does not show while texts to Susan are going', async () => {
    const { calendar } = await calendarWithDueReminder();
    renderApp('/', { calendar });
    expect((await screen.findAllByText('Eye exam')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
