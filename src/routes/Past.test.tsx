// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atWidth, daysFromToday, emptyCalendar, linda, mark, renderApp } from '../test/renderApp';

const realMatchMedia = window.matchMedia;
beforeEach(() => atWidth('phone'));
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

/** The past Appointments, top to bottom, each as the words on its row. */
const pastRows = async () =>
  within(await screen.findByRole('list', { name: 'Past Appointments' }))
    .getAllByRole('listitem')
    .map((row) => row.textContent);

/** A calendar with Appointments either side of today, one of the past ones cancelled. */
async function aFewMonths() {
  const calendar = emptyCalendar();
  await calendar.core.addAppointment(linda, {
    what: 'Cardiology check-up',
    date: daysFromToday(-40),
    time: '14:00',
    withWhom: 'Dr. Patel',
  });
  const hair = await calendar.core.addAppointment(mark, {
    what: 'Hair',
    date: daysFromToday(-2),
    time: '11:00',
    placeName: "Maria's Salon",
  });
  await calendar.core.addAppointment(mark, {
    what: 'Flu shot',
    date: daysFromToday(-9),
    time: '10:30',
  });
  await calendar.core.addAppointment(linda, {
    what: 'Eye exam',
    date: daysFromToday(3),
    time: '15:30',
  });
  await calendar.core.cancelAppointment(linda, hair.id);
  return { calendar, hair };
}

describe('the Past screen', () => {
  it('lists Appointments that have already happened, newest first, cancelled ones marked', async () => {
    const { calendar } = await aFewMonths();
    renderApp('/past', { calendar });
    const rows = await pastRows();
    expect(rows.map((row) => /Cardiology check-up|Hair|Flu shot|Eye exam/.exec(row!)?.[0])).toEqual(
      ['Hair', 'Flu shot', 'Cardiology check-up'],
    );
    expect(rows[0]).toMatch(/Hair.*Cancelled/);
    expect(rows[1]).not.toMatch(/Cancelled/);
    expect(rows[2]).toContain('2:00 pm · Dr. Patel');
  });

  it('says so when nothing has happened yet', async () => {
    renderApp('/past');
    expect(await screen.findByText('No past Appointments.')).toBeInTheDocument();
  });

  it('is reached on a phone from a link at the end of the Upcoming list, and leads back to it', async () => {
    const { calendar } = await aFewMonths();
    renderApp('/', { calendar });
    expect(
      within(screen.getByRole('navigation', { name: 'Main' })).queryByRole('link', {
        name: 'Past',
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('link', { name: 'Past Appointments' }));
    expect(window.location.pathname).toBe('/past');
    expect(screen.getByRole('heading', { level: 1, name: 'Past' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Back to Upcoming' }));
    expect(window.location.pathname).toBe('/');
  });

  it('opens a past Appointment in full on a phone, with a way back to Past', async () => {
    const { calendar, hair } = await aFewMonths();
    renderApp('/past', { calendar });
    await userEvent.click(await screen.findByRole('link', { name: /Hair/ }));
    expect(window.location.pathname).toBe(`/appointments/${hair.id}`);
    expect(screen.getByRole('heading', { level: 1, name: 'Hair' })).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText(/^Added by Mark on /)).toBeInTheDocument();
    expect(screen.getByText(/^Cancelled by Linda on /)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back to Past' }));
    expect(await pastRows()).toHaveLength(3);
  });
});

describe('the Past screen, on a desktop', () => {
  beforeEach(() => atWidth('desktop'));
  const panel = () => screen.getByRole('complementary', { name: 'Appointment details' });

  it('is a sidebar tab, and opens a past Appointment in the panel beside the list', async () => {
    const { calendar } = await aFewMonths();
    renderApp('/', { calendar });
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Past' }),
    );
    expect(screen.queryByRole('link', { name: 'Past Appointments' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('link', { name: /Flu shot/ }));

    expect(
      within(panel()).getByRole('heading', { level: 2, name: 'Flu shot' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'Past' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Flu shot/ })).toHaveAttribute('aria-current', 'true');
  });
});
