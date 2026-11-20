// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatDate } from '../lib/localTime';
import { addMonths, formatMonth, monthOf, monthWeeks } from '../lib/monthGrid';
import { atWidth, daysFromToday, emptyCalendar, linda, mark, renderApp } from '../test/renderApp';

const realMatchMedia = window.matchMedia;
beforeEach(() => atWidth('phone'));
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

const today = () => daysFromToday(0);
const thisMonth = () => monthOf(today());

/** The month grid on show. */
const grid = () => screen.getByRole('table');
/** A day in the grid, by its date. On a phone each day is a button. */
const day = (date: string) => within(grid()).getByRole('button', { name: dayName(date) });
const dayName = (date: string) => new RegExp(`^${formatDate(date)}(,|$)`);

/** A day as the list beneath the grid heads it: "Thu, Nov 19", with the year if not this one's. */
const brief = (date: string) =>
  date.slice(0, 4) === today().slice(0, 4)
    ? formatDate(date, 'short').replace(/, \d{4}$/, '')
    : formatDate(date, 'short');

/** The days listed beneath the grid, each as its heading and the words on its rows. */
const listed = () =>
  within(screen.getByRole('region', { name: 'Picked day' }))
    .getAllByRole('heading', { level: 2 })
    .map((heading) => {
      const list = heading.parentElement!.querySelector('ul');
      const rows = list
        ? within(list)
            .getAllByRole('listitem')
            .map((row) => row.textContent)
        : [];
      return [heading.textContent, ...rows];
    });

/**
 * A month from this one on whose grid shows days of a neighbouring month (a February that starts
 * on a Sunday shows none), as how many months ahead it is and one such day.
 */
const monthWithNeighbours = () => {
  for (let ahead = 0; ; ahead++) {
    const month = addMonths(thisMonth(), ahead);
    const outside = monthWeeks(month)
      .flat()
      .find((date) => monthOf(date) !== month);
    if (outside) return { ahead, outside };
  }
};

const nextMonth = () => userEvent.click(screen.getByRole('button', { name: 'Next month' }));

describe('the Month tab, on a phone', () => {
  it('shows this month with today marked, and a mark on each day that has an Appointment', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, { what: 'Hair', date: today(), time: '11:00' });
    renderApp('/month', { calendar });

    expect(
      await screen.findByRole('heading', { level: 1, name: formatMonth(thisMonth()) }),
    ).toBeInTheDocument();
    expect(day(today())).toHaveAttribute('aria-current', 'date');
    expect(day(today())).toHaveAccessibleName(`${formatDate(today())}, 1 Appointment`);
    expect(day(`${thisMonth()}-01`).getAttribute('aria-current') === 'date').toBe(
      today().endsWith('-01'),
    );
  });

  it('marks a day whose only Appointment was cancelled as cancelled, and lists it as cancelled', async () => {
    const calendar = emptyCalendar();
    const hair = await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: today(),
      time: '11:00',
    });
    await calendar.core.cancelAppointment(mark, hair.id);
    await calendar.core.addAppointment(linda, {
      what: 'Eye exam',
      date: daysFromToday(2),
      time: '15:30',
    });
    renderApp('/month', { calendar });
    await screen.findByRole('table');

    expect(day(today())).toHaveAccessibleName(`${formatDate(today())}, 1 cancelled Appointment`);
    expect(day(today()).querySelector('.mark')).toHaveClass('cancelled');
    expect(listed()[0]).toEqual([`${brief(today())} Today`, '11:00 amHairCancelled']);
    // Its Reminder, the day before at 6:00 pm, is still to be sent.
    expect(listed()[1][1]).toBe('3:30 pmEye exam1 Reminder to send');
  });

  it('does not count a Reminder whose words hold a web address as one to send', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, {
      what: 'Eye exam',
      date: daysFromToday(2),
      time: '15:30',
      noteForSusan: 'Check in at example.de',
    });
    await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: daysFromToday(2),
      time: '11:00',
      noteForSusan: 'Ask for Mr.Li at the desk.',
    });
    renderApp('/month', { calendar });
    await screen.findByRole('table');
    const rows = listed().flatMap(([, ...words]) => words);
    expect(rows).toContain('3:30 pmEye exam');
    expect(rows).toContain('11:00 amHair1 Reminder to send');
  });

  it('counts a cancelled Appointment apart from the ones still on', async () => {
    const calendar = emptyCalendar();
    const hair = await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: today(),
      time: '11:00',
    });
    await calendar.core.addAppointment(linda, { what: 'Lunch', date: today(), time: '12:30' });
    await calendar.core.addAppointment(linda, { what: 'Walk', date: today(), time: '16:00' });
    await calendar.core.cancelAppointment(mark, hair.id);
    renderApp('/month', { calendar });
    await screen.findByRole('table');
    expect(day(today())).toHaveAccessibleName(
      `${formatDate(today())}, 2 Appointments, 1 cancelled`,
    );
    expect(day(today()).querySelector('.mark')).not.toHaveClass('cancelled');
  });

  it("lists today's Appointments beneath the grid to begin with, then the ones after it", async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, {
      what: 'Cardiology check-up',
      date: today(),
      time: '14:00',
      withWhom: 'Dr. Patel',
      placeName: 'Heart Clinic',
      driverName: 'Linda',
      pickupTime: '13:15',
    });
    await calendar.core.addAppointment(mark, {
      what: 'Blood draw',
      date: daysFromToday(4),
      time: '09:00',
      placeName: 'Riverside Lab',
    });
    await calendar.core.addAppointment(mark, {
      what: 'Flu shot',
      date: daysFromToday(-3),
      time: '10:30',
    });
    renderApp('/month', { calendar });
    await screen.findByRole('table');

    expect(listed()).toEqual([
      [
        `${brief(today())} Today`,
        '2:00 pmCardiology check-upDr. Patel · Heart ClinicLinda picks up at 1:15 pm',
      ],
      // Today's has no Reminder left to send; the later one has its starting Reminder still to go.
      [brief(daysFromToday(4)), '9:00 amBlood drawRiverside Lab1 Reminder to send'],
    ]);
    expect(day(today())).toHaveAttribute('aria-pressed', 'true');
  });

  it("picking a day lists that day's Appointments, then the ones after it", async () => {
    const calendar = emptyCalendar();
    // Days in this month, whether or not they have passed: any day can be picked.
    const [tenth, twelfth, nineteenth] = ['10', '12', '19'].map((d) => `${thisMonth()}-${d}`);
    // No Reminders, so that what each row says does not depend on today's date.
    const reminders: [] = [];
    await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: tenth,
      time: '11:00',
      reminders,
    });
    await calendar.core.addAppointment(linda, {
      what: 'Eye exam',
      date: twelfth,
      time: '15:30',
      reminders,
    });
    await calendar.core.addAppointment(linda, {
      what: 'Blood draw',
      date: nineteenth,
      time: '09:00',
      reminders,
    });
    renderApp('/month', { calendar });
    await screen.findByRole('table');

    await userEvent.click(day(twelfth));
    expect(day(twelfth)).toHaveAttribute('aria-pressed', 'true');
    expect(within(grid()).getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(listed().map(([heading, ...rows]) => [heading.slice(0, 11), ...rows])).toEqual([
      [formatDate(twelfth, 'short').slice(0, 11), '3:30 pmEye exam'],
      [formatDate(nineteenth, 'short').slice(0, 11), '9:00 amBlood draw'],
    ]);
  });

  it('says so when the picked day is free', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, {
      what: 'Blood draw',
      date: daysFromToday(3),
      time: '09:00',
    });
    renderApp('/month', { calendar });
    await screen.findByRole('table');
    const region = screen.getByRole('region', { name: 'Picked day' });
    expect(within(region).getByText('Nothing on this day.')).toBeInTheDocument();
    expect(region).toHaveTextContent('Blood draw');
  });

  it('opens an Appointment from the list as a full screen, and goes back to the Month', async () => {
    const calendar = emptyCalendar();
    const later = `${thisMonth()}-20`;
    const { id } = await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: later,
      time: '11:00',
    });
    renderApp('/month', { calendar });
    await screen.findByRole('table');
    await userEvent.click(day(later));
    await userEvent.click(screen.getByRole('link', { name: /Hair/ }));
    expect(window.location.pathname).toBe(`/appointments/${id}`);
    expect(screen.getByRole('heading', { level: 1, name: 'Hair' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back to Month' }));
    expect(window.location.pathname).toBe('/month');
    // The picked day is kept.
    expect(day(later)).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves between months with Previous, Next and Today', async () => {
    renderApp('/month');
    await screen.findByRole('table');
    const heading = () => screen.getByRole('heading', { level: 1 });

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(heading()).toHaveTextContent(formatMonth(addMonths(thisMonth(), 1)));
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(heading()).toHaveTextContent(formatMonth(addMonths(thisMonth(), 2)));
    expect(within(grid()).queryByRole('button', { current: 'date' })).not.toBeInTheDocument();
    // A month other than today's starts with its first day picked.
    expect(day(`${addMonths(thisMonth(), 2)}-01`)).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(heading()).toHaveTextContent(formatMonth(addMonths(thisMonth(), -1)));

    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(heading()).toHaveTextContent(formatMonth(thisMonth()));
    expect(day(today())).toHaveAttribute('aria-pressed', 'true');
  });

  it("shows the neighbouring months' days, quieter, and picking one moves to its month", async () => {
    renderApp('/month');
    await screen.findByRole('table');
    const { ahead, outside } = monthWithNeighbours();
    for (let n = 0; n < ahead; n++) await nextMonth();
    expect(day(outside).closest('td')).toHaveClass('other-month');
    expect(day(`${addMonths(thisMonth(), ahead)}-15`).closest('td')).not.toHaveClass('other-month');

    await userEvent.click(day(outside));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      formatMonth(monthOf(outside)),
    );
    expect(day(outside)).toHaveAttribute('aria-pressed', 'true');
    expect(day(outside).closest('td')).not.toHaveClass('other-month');
  });
});

describe('the Month tab, on a desktop', () => {
  beforeEach(() => atWidth('desktop'));
  const panel = () => screen.getByRole('complementary', { name: 'Appointment details' });
  /** An Appointment in the grid, by its time, name and day. */
  const inGrid = (time: string, what: string, date: string) =>
    within(grid()).getByRole('link', { name: `${time} ${what}, ${formatDate(date)}` });

  it("shows each Appointment in its day's cell by time and name, and opens one in the panel", async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, {
      what: 'Cardiology check-up',
      date: today(),
      time: '14:00',
    });
    const hair = await calendar.core.addAppointment(mark, {
      what: 'Hair',
      date: today(),
      time: '11:00',
    });
    renderApp('/month', { calendar });
    await screen.findByRole('table');

    expect(inGrid('2:00 pm', 'Cardiology check-up', today())).toHaveTextContent(
      '2:00 pmCardiology check-up',
    );
    expect(screen.getByRole('cell', { current: 'date' })).toHaveTextContent(
      /11:00 amHair2:00 pmCardiology check-up$/,
    );
    expect(within(panel()).queryByRole('heading')).not.toBeInTheDocument();

    await userEvent.click(inGrid('11:00 am', 'Hair', today()));
    expect(window.location.pathname).toBe(`/appointments/${hair.id}`);
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Hair' })).toBeInTheDocument();
    // The Month stays in the middle, with the picked Appointment marked.
    expect(
      within(screen.getByRole('main')).getByRole('heading', {
        level: 1,
        name: formatMonth(thisMonth()),
      }),
    ).toBeInTheDocument();
    expect(inGrid('11:00 am', 'Hair', today())).toHaveAttribute('aria-current', 'true');

    // Moving to another month keeps the Appointment open.
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Hair' })).toBeInTheDocument();
  });

  it('shows a cancelled Appointment in its cell, marked as cancelled', async () => {
    const calendar = emptyCalendar();
    const hair = await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: today(),
      time: '11:00',
    });
    await calendar.core.addAppointment(linda, { what: 'Lunch', date: today(), time: '12:30' });
    await calendar.core.cancelAppointment(mark, hair.id);
    renderApp('/month', { calendar });
    await screen.findByRole('table');

    const cancelled = within(grid()).getByRole('link', {
      name: `Cancelled: 11:00 am Hair, ${formatDate(today())}`,
    });
    expect(cancelled).toHaveTextContent('11:00 amHairCancelled');
    expect(cancelled).toHaveClass('cancelled');
    expect(inGrid('12:30 pm', 'Lunch', today())).not.toHaveClass('cancelled');

    await userEvent.click(cancelled);
    expect(within(panel()).getByText('Cancelled')).toBeInTheDocument();
  });

  it('says how many more there are when a day has more than fit in its cell', async () => {
    const calendar = emptyCalendar();
    for (const [what, time] of [
      ['Breakfast', '08:00'],
      ['Blood draw', '09:00'],
      ['Hair', '11:00'],
      ['Lunch', '12:30'],
    ])
      await calendar.core.addAppointment(linda, { what, date: today(), time });
    renderApp('/month', { calendar });
    await screen.findByRole('table');

    const cell = screen.getByRole('cell', { current: 'date' });
    expect(within(cell).getAllByRole('link')).toHaveLength(2);
    await userEvent.click(within(cell).getByRole('button', { name: '2 more' }));
    expect(
      within(cell)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['8:00 amBreakfast', '9:00 amBlood draw', '11:00 amHair', '12:30 pmLunch']);
  });

  it("shows the neighbouring months' Appointments in their days, quieter", async () => {
    const calendar = emptyCalendar();
    const { ahead, outside } = monthWithNeighbours();
    await calendar.core.addAppointment(linda, { what: 'Eye exam', date: outside, time: '15:30' });
    renderApp('/month', { calendar });
    await screen.findByRole('table');
    for (let n = 0; n < ahead; n++) await nextMonth();
    expect(inGrid('3:30 pm', 'Eye exam', outside).closest('td')).toHaveClass('other-month');
  });
});
