// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSampleCalendar, SAMPLE_FEED_URL } from '../../data/sampleCalendar';
import { createFixedClock } from '../../lib/calendar';
import { atWidth, daysFromToday, EASTERN, linda, renderApp } from '../../test/renderApp';

const realMatchMedia = window.matchMedia;
beforeEach(() => atWidth('phone'));
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

/** A calendar holding one Appointment, with a clock at 19 November 2026, 3:15 pm for Susan. */
async function withAppointment() {
  const clock = createFixedClock('2026-11-19T20:15:00.000Z');
  const calendar = createSampleCalendar(EASTERN, { empty: true, clock });
  await calendar.core.addAppointment(linda, {
    what: 'Cardiology check-up',
    date: daysFromToday(4),
    time: '14:00',
    privateNotes: 'Ask about the new prescription.',
  });
  return calendar;
}

const section = () => screen.getByRole('region', { name: 'Calendar subscription' });
/** The secret at the end of a link's address. */
const secretOf = (address: string) => address.slice(SAMPLE_FEED_URL.length);

describe('the Calendar subscription section of Settings', () => {
  it('makes a link to paste into a calendar app, shows it in full, and copies it', async () => {
    const user = userEvent.setup();
    const calendar = await withAppointment();
    renderApp('/settings', { calendar });
    const here = within(section());
    expect(await here.findByText('You have no link.')).toBeTruthy();
    expect(here.getByText(/Private notes are left out/)).toBeTruthy();

    await user.click(here.getByRole('button', { name: 'Get my link' }));
    const link = (await here.findByRole('textbox', { name: 'Your link' })) as HTMLInputElement;
    expect(link.readOnly).toBe(true);
    expect(link.value.startsWith(SAMPLE_FEED_URL)).toBe(true);
    expect(here.getByText(/shown only this once/)).toBeTruthy();
    expect(here.getByText(/Add Subscribed Calendar/)).toBeTruthy();

    await user.click(here.getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(link.value);
    expect(here.getByRole('status').textContent).toBe('Copied.');

    // The link works: its feed holds the Appointment and leaves out its Private notes.
    const feed = await calendar.core.subscriptionFeed(secretOf(link.value));
    expect(feed).toContain('SUMMARY:Cardiology check-up');
    expect(feed).not.toContain('prescription');
  });

  it('never shows the link again once the screen is left, only that there is one', async () => {
    const user = userEvent.setup();
    const calendar = await withAppointment();
    const first = renderApp('/settings', { calendar });
    await user.click(await within(section()).findByRole('button', { name: 'Get my link' }));
    const address = (
      (await within(section()).findByRole('textbox', { name: 'Your link' })) as HTMLInputElement
    ).value;
    first.unmount();

    renderApp('/settings', { calendar });
    const here = within(section());
    expect(
      await here.findByText(/You have a link, made Thu, Nov 19, 2026 at 3:15 pm/),
    ).toBeTruthy();
    expect(here.queryByRole('textbox')).toBeNull();
    expect(document.body.textContent).not.toContain(secretOf(address));
  });

  it('replaces the link with a new one, after asking, and the old one stops working', async () => {
    const user = userEvent.setup();
    const calendar = await withAppointment();
    renderApp('/settings', { calendar });
    const here = within(section());
    await user.click(await here.findByRole('button', { name: 'Get my link' }));
    const old = ((await here.findByRole('textbox', { name: 'Your link' })) as HTMLInputElement)
      .value;

    await user.click(here.getByRole('button', { name: 'Get a new link' }));
    const asking = here.getByRole('group', { name: 'Get a new link?' });
    expect(asking.textContent).toMatch(/old link will stop working/);
    await user.click(within(asking).getByRole('button', { name: 'Yes, get a new link' }));

    const replaced = ((await here.findByRole('textbox', { name: 'Your link' })) as HTMLInputElement)
      .value;
    expect(replaced).not.toBe(old);
    expect(await calendar.core.subscriptionFeed(secretOf(old))).toBeNull();
    expect(await calendar.core.subscriptionFeed(secretOf(replaced))).toContain('BEGIN:VCALENDAR');
  });

  it('switches the link off, after asking, and it stops working', async () => {
    const user = userEvent.setup();
    const calendar = await withAppointment();
    renderApp('/settings', { calendar });
    const here = within(section());
    await user.click(await here.findByRole('button', { name: 'Get my link' }));
    const address = ((await here.findByRole('textbox', { name: 'Your link' })) as HTMLInputElement)
      .value;

    await user.click(here.getByRole('button', { name: 'Switch off link' }));
    const asking = here.getByRole('group', { name: 'Switch off your link?' });
    await user.click(within(asking).getByRole('button', { name: 'No, keep it' }));
    expect(await calendar.core.subscriptionFeed(secretOf(address))).not.toBeNull();

    await user.click(here.getByRole('button', { name: 'Switch off link' }));
    await user.click(
      within(here.getByRole('group', { name: 'Switch off your link?' })).getByRole('button', {
        name: 'Yes, switch it off',
      }),
    );
    expect(await here.findByText('You have no link.')).toBeTruthy();
    expect(here.queryByRole('textbox')).toBeNull();
    expect(await calendar.core.subscriptionFeed(secretOf(address))).toBeNull();
  });

  it('works the same at a desktop width', async () => {
    atWidth('desktop');
    const user = userEvent.setup();
    renderApp('/settings', { calendar: await withAppointment() });
    await user.click(await within(section()).findByRole('button', { name: 'Get my link' }));
    expect(await within(section()).findByRole('textbox', { name: 'Your link' })).toBeTruthy();
  });
});
