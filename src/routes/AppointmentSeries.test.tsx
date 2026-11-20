// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { weekdayOf, type Appointment } from '../lib/calendar';
import { addDays } from '../lib/localTime';
import { atWidth, daysFromToday, emptyCalendar, linda, renderApp } from '../test/renderApp';

const realMatchMedia = window.matchMedia;
beforeEach(() => atWidth('phone'));
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

const field = (name: string) => screen.getByLabelText(name);
const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));

/** The first Monday at least three days from today, in Susan's time zone. */
const monday = () => {
  const soon = daysFromToday(3);
  return addDays(soon, (7 - weekdayOf(soon)) % 7);
};

/** A calendar holding dialysis every Monday and Thursday at 9:00 am, from `monday()`. */
async function withDialysis() {
  const calendar = emptyCalendar();
  const { series, appointments } = await calendar.core.addSeries(linda, {
    what: 'Dialysis',
    date: monday(),
    time: '09:00',
    placeName: 'Riverside Dialysis',
    repeat: { every: 'week', weekdays: [0, 3] },
  });
  const inSeries = (seriesId: string) =>
    calendar.store.appointments().filter((each) => each.series?.id === seriesId);
  return { calendar, series, appointments, inSeries };
}

describe('making an Appointment repeat', () => {
  it('adds a Series from the form: weekly on chosen days, with no end', async () => {
    const date = monday();
    const { calendar } = renderApp('/appointments/new');
    await userEvent.type(field('What it is'), 'Dialysis');
    await userEvent.type(field('Date'), date);
    await userEvent.type(field('Start time'), '09:00');
    await userEvent.selectOptions(field('How it repeats'), 'week');
    // It starts on the day the Appointment is on.
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Thursday' }));
    expect(screen.getByText('Every week on Monday and Thursday')).toBeInTheDocument();
    await save();

    await screen.findByRole('heading', { level: 1, name: 'Dialysis' });
    const kept = calendar.store.appointments();
    expect(kept.length).toBeGreaterThan(40);
    expect(kept.slice(0, 3).map(({ date: day }) => day)).toEqual([
      date,
      addDays(date, 3),
      addDays(date, 7),
    ]);
    expect(kept.every(({ time }) => time === '09:00')).toBe(true);
    expect(calendar.store.everySeriesKept()).toHaveLength(1);
    expect(calendar.store.activity()).toHaveLength(1);
    // The first one opens, saying how it repeats.
    expect(screen.getByText('Every week on Monday and Thursday')).toBeInTheDocument();
  });

  it('every few weeks, or monthly, ending on a date', async () => {
    const date = monday();
    const { calendar } = renderApp('/appointments/new');
    await userEvent.type(field('What it is'), 'Check-up');
    await userEvent.type(field('Date'), date);
    await userEvent.type(field('Start time'), '11:00');
    await userEvent.selectOptions(field('How it repeats'), 'month');
    await userEvent.clear(field('How many months apart'));
    await userEvent.type(field('How many months apart'), '2');
    await userEvent.selectOptions(field('Ends'), 'on');
    await userEvent.type(field('Last date'), addDays(date, 130));
    await save();

    await screen.findByRole('heading', { level: 1, name: 'Check-up' });
    expect(calendar.store.appointments().length).toBe(3);
    expect(calendar.store.everySeriesKept()[0]).toMatchObject({
      repeat: { every: 'month', interval: 2 },
      ends: addDays(date, 130),
    });
  });

  it('offers only Reminders that follow each Appointment, never an exact time', async () => {
    renderApp('/appointments/new');
    const shape = () => screen.getByLabelText('When it goes out');
    expect(within(shape()).getByRole('option', { name: /exact/ })).toBeInTheDocument();
    await userEvent.selectOptions(field('How it repeats'), 'week');
    expect(within(shape()).queryByRole('option', { name: /exact/ })).not.toBeInTheDocument();
  });

  it("says the core's refusal, such as a first date that is not a day it repeats on", async () => {
    const { calendar } = renderApp('/appointments/new');
    await userEvent.type(field('What it is'), 'Dialysis');
    await userEvent.type(field('Date'), monday());
    await userEvent.type(field('Start time'), '09:00');
    await userEvent.selectOptions(field('How it repeats'), 'week');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Monday' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tuesday' }));
    await save();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /on a Monday, which is not a day it repeats on/,
    );
    expect(calendar.store.appointments()).toEqual([]);
  });
});

describe('an Appointment in a Series', () => {
  it('is marked as repeating in lists and in its detail', async () => {
    const { calendar, appointments } = await withDialysis();
    await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: addDays(monday(), 1),
      time: '13:00',
    });
    renderApp('/', { calendar });
    const next = await screen.findByRole('region', { name: 'Next up' });
    expect(within(next).getByText('Repeats')).toBeInTheDocument();
    const later = screen.getByRole('list', { name: 'Later Appointments' });
    expect(within(later).getByRole('link', { name: /Hair/ })).not.toHaveTextContent('Repeats');
    expect(within(later).getAllByRole('link', { name: /Dialysis/ })[0]).toHaveTextContent(
      'Repeats',
    );

    await userEvent.click(within(next).getByRole('link'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dialysis' })).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/appointments/${appointments[0].id}`);
    expect(screen.getByText('Every week on Monday and Thursday')).toBeInTheDocument();
  });

  it('asks whether a change is for only this one, and changes only that one', async () => {
    const { calendar, appointments, inSeries, series } = await withDialysis();
    const [, second, third] = appointments;
    renderApp(`/appointments/${second.id}/edit`, { calendar });
    await userEvent.clear(await screen.findByLabelText('Start time'));
    await userEvent.type(field('Start time'), '10:30');
    await save();

    const choice = screen.getByRole('group', { name: 'Change which Appointments?' });
    expect(calendar.store.appointments().find(({ id }) => id === second.id)?.time).toBe('09:00');
    await userEvent.click(within(choice).getByRole('button', { name: 'Only this one' }));

    await screen.findByRole('heading', { level: 1, name: 'Dialysis' });
    expect(
      screen.getByText('Changed on its own, apart from the rest of the Series.'),
    ).toBeInTheDocument();
    const now = inSeries(series.id);
    expect(now.find(({ id }) => id === second.id)?.time).toBe('10:30');
    expect(now.find(({ id }) => id === third.id)?.time).toBe('09:00');
  });

  it('can change this and all later ones instead', async () => {
    const { calendar, appointments, series, inSeries } = await withDialysis();
    const [first, , third] = appointments;
    renderApp(`/appointments/${third.id}/edit`, { calendar });
    await userEvent.clear(await screen.findByLabelText('Driver'));
    await userEvent.type(field('Driver'), 'Mark');
    await save();
    await userEvent.click(screen.getByRole('button', { name: 'This and all later ones' }));

    await screen.findByRole('heading', { level: 1, name: 'Dialysis' });
    const changed = calendar.store.appointments().find(({ id }) => id === third.id)!;
    const later = inSeries(changed.series!.id);
    expect(later.length).toBeGreaterThan(10);
    expect(later.every(({ driverName }) => driverName === 'Mark')).toBe(true);
    expect(inSeries(series.id).map(({ id }) => id)).toEqual([first.id, appointments[1].id]);
  });

  it('a change to how it repeats is only for this and all later ones', async () => {
    const { calendar, appointments } = await withDialysis();
    renderApp(`/appointments/${appointments[2].id}/edit`, { calendar });
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Thursday' }));
    await save();
    const choice = screen.getByRole('group', { name: 'Change which Appointments?' });
    expect(within(choice).queryByRole('button', { name: 'Only this one' })).not.toBeInTheDocument();
    await userEvent.click(within(choice).getByRole('button', { name: 'This and all later ones' }));
    await screen.findByRole('heading', { level: 1, name: 'Dialysis' });
    expect(screen.getByText('Every week on Monday')).toBeInTheDocument();
  });

  it('asks whether to cancel only this one or this and all later ones', async () => {
    const { calendar, appointments, series, inSeries } = await withDialysis();
    const [, second, third] = appointments;
    renderApp(`/appointments/${second.id}`, { calendar });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel Appointment' }));
    const choice = screen.getByRole('group', { name: 'Cancel which Appointments?' });
    await userEvent.click(within(choice).getByRole('button', { name: 'Cancel only this one' }));
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    const states = (all: Appointment[]) => all.slice(0, 4).map(({ state }) => state);
    expect(states(inSeries(series.id))).toEqual(['active', 'cancelled', 'active', 'active']);

    cleanup();
    renderApp(`/appointments/${third.id}`, { calendar });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel Appointment' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel this and all later ones' }));
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    const all = inSeries(series.id);
    expect(states(all)).toEqual(['active', 'cancelled', 'cancelled', 'cancelled']);
    expect(all.slice(2).every(({ state }) => state === 'cancelled')).toBe(true);
  });
});
