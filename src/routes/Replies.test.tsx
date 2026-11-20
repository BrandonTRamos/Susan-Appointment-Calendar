// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSampleCalendar, SAMPLE_NUMBER } from '../data/sampleCalendar';
import { createFixedClock } from '../lib/calendar';
import { atWidth, EASTERN, linda, renderApp } from '../test/renderApp';

const realMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

/** A sample calendar on Thursday 19 November 2026 at 3:00 pm, Susan's time, with no Appointments. */
async function sampleCalendar() {
  const clock = createFixedClock('2026-11-19T20:00:00.000Z');
  const calendar = createSampleCalendar(EASTERN, { empty: true, clock });
  await calendar.settings();
  await calendar.core.changeSettings(linda, { contactName: 'Linda', contactPhone: '5555550187' });
  /** Susan texts back, a minute after the last. */
  const reply = async (words: string) => {
    clock.set(new Date(clock.now().getTime() + 60_000).toISOString());
    return calendar.core.receiveReply({ key: null, words, from: SAMPLE_NUMBER });
  };
  return { calendar, clock, reply };
}

const repliesTab = () =>
  within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
    name: /^Replies/,
  });

describe.each(['phone', 'desktop'] as const)('the Replies tab, at %s width', (width) => {
  beforeEach(() => atWidth(width));

  it('lists her Replies newest first, with when each came and what she wrote', async () => {
    const { calendar, reply } = await sampleCalendar();
    await reply('Running late');
    await reply("I can't go, I'm not well");
    await calendar.core.runDue();
    renderApp('/replies', { calendar });
    const list = await screen.findByRole('list', { name: 'Replies' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.reply-words')?.textContent)).toEqual([
      "I can't go, I'm not well",
      'Running late',
    ]);
    expect(items[0]).toHaveTextContent('Thu, Nov 19, 2026 at 3:02 pm');
    expect(items[1]).toHaveTextContent('Thu, Nov 19, 2026 at 3:01 pm');
    // What became of the automatic answer, from its own record.
    expect(items[1]).toHaveTextContent('Automatic answer:');
    expect(items[1]).toHaveTextContent('Sent');
    expect(items[0]).toHaveTextContent(
      'No automatic answer: she had one less than an hour before.',
    );
    expect(screen.getByText(/never acts on what she writes/)).toBeInTheDocument();
  });

  it('says when there are none yet', async () => {
    const { calendar } = await sampleCalendar();
    renderApp('/replies', { calendar });
    expect(await screen.findByText('No Replies yet.')).toBeInTheDocument();
  });

  it('shows on the tab how many are not yet seen, and counts them seen once the tab is open', async () => {
    const { calendar, reply } = await sampleCalendar();
    await reply('One');
    await reply('Two');
    renderApp('/', { calendar });
    await waitFor(() => expect(repliesTab()).toHaveAccessibleName('Replies, 2 not yet seen'));
    expect(repliesTab()).toHaveTextContent('2');
    // A Reply that comes while the app is open counts too.
    await act(() => reply('Three'));
    await waitFor(() => expect(repliesTab()).toHaveAccessibleName('Replies, 3 not yet seen'));
    await userEvent.click(repliesTab());
    await waitFor(() => expect(repliesTab()).toHaveAccessibleName('Replies'));
    // Those that were new stay marked while the tab is open.
    const list = await screen.findByRole('list', { name: 'Replies' });
    expect(within(list).getAllByText('New')).toHaveLength(3);
    // Seen while it is open: one that comes now is not counted on the tab.
    await act(() => reply('Four'));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(4));
    await waitFor(() => expect(repliesTab()).toHaveAccessibleName('Replies'));
  });

  it('keeps what was seen for the next time the app opens', async () => {
    const { calendar, reply } = await sampleCalendar();
    await reply('One');
    renderApp('/replies', { calendar });
    await screen.findByRole('list', { name: 'Replies' });
    await waitFor(async () => expect(await calendar.repliesSeen()).not.toBeNull());
    cleanup();
    renderApp('/', { calendar });
    await screen.findByRole('navigation', { name: 'Main' });
    await act(async () => {});
    expect(repliesTab()).toHaveAccessibleName('Replies');
    await act(() => reply('Two'));
    await waitFor(() => expect(repliesTab()).toHaveAccessibleName('Replies, 1 not yet seen'));
  });

  it("says when a Reply was not answered because Susan's number changed after it came", async () => {
    const { calendar } = await sampleCalendar();
    await calendar.core.receiveReply({ key: null, words: 'Hello', from: SAMPLE_NUMBER });
    await calendar.core.changeSettings(linda, { susansNumber: '5555550142' });
    await calendar.core.runDue();
    renderApp('/replies', { calendar });
    expect(
      await screen.findByText(
        "No automatic answer: Susan's mobile number was changed in Settings after it came.",
      ),
    ).toBeInTheDocument();
  });

  it('shows invented Replies on sample data, counted until the tab is opened', async () => {
    const calendar = createSampleCalendar(EASTERN);
    renderApp('/', { calendar, sampleData: true });
    await waitFor(() => expect(repliesTab()).toHaveAccessibleName('Replies, 2 not yet seen'));
    await userEvent.click(repliesTab());
    const list = await screen.findByRole('list', { name: 'Replies' });
    expect(within(list).getByText('Running a little late, see you soon')).toBeInTheDocument();
    expect(within(list).getByText('Thank you for the reminder')).toBeInTheDocument();
    await waitFor(() => expect(repliesTab()).toHaveAccessibleName('Replies'));
  });
});
