// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, dayInWords, formatDate, formatMoment, momentOf } from '../lib/localTime';
import {
  atWidth,
  daysFromToday,
  EASTERN,
  emptyCalendar,
  linda,
  mark,
  renderApp,
} from '../test/renderApp';

const realMatchMedia = window.matchMedia;
beforeEach(() => atWidth('phone'));
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

const field = (name: string) => screen.getByLabelText(name);
const reminder = (n: number) => screen.getByRole('group', { name: `Reminder ${n}` });
const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));
/** When a moment in Susan's local time goes out, as the screen says it. */
const goesOut = (date: string, time: string) =>
  `Goes out ${formatMoment(momentOf(date, time, EASTERN)!, EASTERN)}`;

/** Fills in a new Appointment's what, date and start time. */
async function newAppointment(date: string, time = '14:00') {
  const view = renderApp('/appointments/new');
  await userEvent.type(field('What it is'), 'Cardiology check-up');
  await userEvent.type(field('Date'), date);
  await userEvent.type(field('Start time'), time);
  return view;
}

/** Sets a Reminder's clock time in the form. */
async function setTime(group: HTMLElement, time: string) {
  const input = within(group).getByLabelText('Reminder time');
  await userEvent.clear(input);
  await userEvent.type(input, time);
}

describe('the Reminders on a new Appointment', () => {
  it('start with one, the day before at 6:00 pm, showing when it goes out and its words', async () => {
    const date = daysFromToday(4);
    const { calendar } = await newAppointment(date);

    const first = reminder(1);
    expect(within(first).getByLabelText('When it goes out')).toHaveValue('daysBefore');
    expect(within(first).getByLabelText('Days before')).toHaveValue(1);
    expect(within(first).getByLabelText('Reminder time')).toHaveValue('18:00');
    expect(within(first).getByText(goesOut(addDays(date, -1), '18:00'))).toBeInTheDocument();
    expect(
      within(first).getByText("Susan's Calendar: Cardiology check-up, tomorrow at 2:00 pm."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Reminder 2' })).not.toBeInTheDocument();

    await save();
    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(calendar.store.appointments()[0].reminders).toMatchObject([
      { shape: 'daysBefore', days: 1, time: '18:00' },
    ]);
  });

  it('can be added to, changed and removed', async () => {
    const date = daysFromToday(4);
    const { calendar } = await newAppointment(date);

    await userEvent.click(screen.getByRole('button', { name: 'Add a Reminder' }));
    const second = reminder(2);
    await userEvent.selectOptions(within(second).getByLabelText('When it goes out'), 'before');
    await userEvent.clear(within(second).getByLabelText('How long before'));
    await userEvent.type(within(second).getByLabelText('How long before'), '3');
    expect(within(second).getByText(goesOut(date, '11:00'))).toBeInTheDocument();
    expect(
      within(second).getByText("Susan's Calendar: Cardiology check-up, today at 2:00 pm."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add a Reminder' }));
    const third = reminder(3);
    await userEvent.selectOptions(within(third).getByLabelText('When it goes out'), 'at');
    await userEvent.type(within(third).getByLabelText('Reminder date'), addDays(date, -2));
    await setTime(third, '10:00');
    expect(within(third).getByText(goesOut(addDays(date, -2), '10:00'))).toBeInTheDocument();
    expect(
      within(third).getByText(
        `Susan's Calendar: Cardiology check-up, ${formatDate(date, 'noYear')} at 2:00 pm.`,
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(reminder(1)).getByRole('button', { name: 'Remove this Reminder' }),
    );
    await save();
    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(calendar.store.appointments()[0].reminders).toMatchObject([
      { shape: 'at', date: addDays(date, -2), time: '10:00' },
      { shape: 'before', amount: 3, unit: 'hours' },
    ]);
  });
});

describe('the form warns', () => {
  it('when a Reminder falls between 9:00 pm and 7:00 am', async () => {
    await newAppointment(daysFromToday(4), '08:00');
    const overnight = 'This goes out overnight, between 9:00 pm and 7:00 am.';
    expect(within(reminder(1)).queryByText(overnight)).not.toBeInTheDocument();
    await setTime(reminder(1), '21:30');
    expect(within(reminder(1)).getByText(overnight)).toBeInTheDocument();
    await setTime(reminder(1), '06:45');
    expect(within(reminder(1)).getByText(overnight)).toBeInTheDocument();
    await setTime(reminder(1), '07:00');
    expect(within(reminder(1)).queryByText(overnight)).not.toBeInTheDocument();
  });

  it("when a Reminder's time has already passed", async () => {
    // The day before at 6:00 pm is still to come; three days before has passed.
    await newAppointment(daysFromToday(2));
    const passed = 'This time has already passed.';
    expect(within(reminder(1)).queryByText(passed)).not.toBeInTheDocument();
    await userEvent.clear(within(reminder(1)).getByLabelText('Days before'));
    await userEvent.type(within(reminder(1)).getByLabelText('Days before'), '3');
    expect(within(reminder(1)).getByText(passed)).toBeInTheDocument();
  });
});

describe('saving an Appointment that will send no Reminder', () => {
  it('asks first, and saves it with none once the person says so', async () => {
    const { calendar } = await newAppointment(daysFromToday(4));
    await userEvent.click(
      within(reminder(1)).getByRole('button', { name: 'Remove this Reminder' }),
    );
    expect(
      screen.getByText('No Reminders. Susan will not be texted about this Appointment.'),
    ).toBeInTheDocument();

    await save();
    const asking = screen.getByRole('group', { name: 'Save with no Reminder?' });
    expect(asking).toHaveTextContent('No Reminder will be sent for this Appointment.');
    expect(calendar.store.appointments()).toEqual([]);

    await userEvent.click(within(asking).getByRole('button', { name: 'Go back' }));
    expect(screen.queryByRole('group', { name: 'Save with no Reminder?' })).not.toBeInTheDocument();
    expect(calendar.store.appointments()).toEqual([]);

    await save();
    await userEvent.click(screen.getByRole('button', { name: 'Save with no Reminder' }));
    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(calendar.store.appointments()).toMatchObject([{ reminders: [] }]);
  });

  it('asks when every Reminder it has is already past', async () => {
    const { calendar } = await newAppointment(daysFromToday(1));
    await userEvent.clear(within(reminder(1)).getByLabelText('Days before'));
    await userEvent.type(within(reminder(1)).getByLabelText('Days before'), '3');
    await save();
    expect(screen.getByRole('group', { name: 'Save with no Reminder?' })).toBeInTheDocument();
    expect(calendar.store.appointments()).toEqual([]);
  });

  it('asks when its only Reminder in time would hold a web address, says why, and saves on a yes', async () => {
    const { calendar } = await newAppointment(daysFromToday(4));
    await userEvent.type(field('Note for Susan'), 'Check in at example.de');
    // The preview says so before anything is saved, and the words are shown as typed.
    expect(
      within(reminder(1)).getByText(/This text holds a web address, so it will not be sent/),
    ).toBeInTheDocument();
    expect(within(reminder(1)).getByText(/Check in at example\.de/)).toBeInTheDocument();
    await save();
    const asking = screen.getByRole('group', { name: 'Save with no Reminder?' });
    expect(asking).toHaveTextContent('No Reminder will be sent for this Appointment.');
    expect(asking).toHaveTextContent("Its Reminders' words hold a web address");
    expect(calendar.store.appointments()).toEqual([]);
    await userEvent.click(within(asking).getByRole('button', { name: 'Save with no Reminder' }));
    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(calendar.store.appointments()).toMatchObject([
      { noteForSusan: 'Check in at example.de', reminders: [{ shape: 'daysBefore' }] },
    ]);
    // On the Appointment, the Reminder is kept, says it will not be sent, and warns why.
    const kept = within(await screen.findByRole('list', { name: 'Reminders' }));
    expect(kept.getByText('Will not be sent')).toBeInTheDocument();
    expect(kept.getByText(/This text holds a web address, so it will not be sent/)).toBeTruthy();
  });

  it('does not say why when no Reminder falls in time at all', async () => {
    await newAppointment(daysFromToday(4));
    await userEvent.click(
      within(reminder(1)).getByRole('button', { name: 'Remove this Reminder' }),
    );
    await save();
    const asking = screen.getByRole('group', { name: 'Save with no Reminder?' });
    expect(asking).not.toHaveTextContent('web address');
  });

  it('does not ask when the web address is only in the Private notes, which no text carries', async () => {
    const { calendar } = await newAppointment(daysFromToday(4));
    await userEvent.type(field('Private notes'), 'Portal: https://portal.example.com');
    await save();
    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(calendar.store.appointments()).toHaveLength(1);
  });

  it('does not ask when one Reminder is still to be sent', async () => {
    const { calendar } = await newAppointment(daysFromToday(4));
    await save();
    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(calendar.store.appointments()).toHaveLength(1);
  });
});

describe('an exact-time Reminder whose Appointment has moved', () => {
  async function moved() {
    const calendar = emptyCalendar();
    const date = daysFromToday(4);
    const appointment = await calendar.core.addAppointment(linda, {
      what: 'Cardiology check-up',
      date,
      time: '14:00',
      reminders: [{ shape: 'at', date: addDays(date, -1), time: '17:00' }],
    });
    await calendar.core.changeAppointment(mark, appointment.id, { date: addDays(date, 1) });
    return { calendar, appointment };
  }

  it('is flagged on the Appointment for someone to check', async () => {
    const { calendar, appointment } = await moved();
    renderApp(`/appointments/${appointment.id}`, { calendar });
    const list = await screen.findByRole('list', { name: 'Reminders' });
    expect(within(list).getByText(/has moved since this Reminder was set/)).toBeInTheDocument();
  });

  it('stays on the Appointment, flagged, when the move puts it after the new start', async () => {
    const calendar = emptyCalendar();
    const date = daysFromToday(4);
    const appointment = await calendar.core.addAppointment(linda, {
      what: 'Cardiology check-up',
      date,
      time: '14:00',
      reminders: [{ shape: 'at', date: addDays(date, -1), time: '17:00' }],
    });
    // Two days earlier: the Reminder, the day before the old date, is now a day after the start.
    await calendar.core.changeAppointment(mark, appointment.id, { date: addDays(date, -2) });
    renderApp(`/appointments/${appointment.id}`, { calendar });
    const list = await screen.findByRole('list', { name: 'Reminders' });
    expect(within(list).getByText(goesOut(addDays(date, -1), '17:00'))).toBeInTheDocument();
    expect(within(list).getByText(/has moved since this Reminder was set/)).toBeInTheDocument();
  });

  it('can be kept at its time in the form, which clears the flag', async () => {
    const { calendar, appointment } = await moved();
    renderApp(`/appointments/${appointment.id}/edit`, { calendar });
    const check = await screen.findByRole('group', { name: 'Check this Reminder' });
    await userEvent.click(within(check).getByRole('button', { name: 'Keep this time' }));
    expect(screen.queryByRole('group', { name: 'Check this Reminder' })).not.toBeInTheDocument();
    await save();
    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(calendar.store.appointments()[0].reminders).toMatchObject([
      { shape: 'at', time: '17:00', needsReview: false },
    ]);
    expect(screen.queryByText(/has moved since this Reminder was set/)).not.toBeInTheDocument();
  });
});

describe("an opened Appointment's Reminders", () => {
  it('show when each goes out and the exact words Susan will read, never the Private notes', async () => {
    const calendar = emptyCalendar();
    const date = daysFromToday(4);
    const appointment = await calendar.core.addAppointment(linda, {
      what: 'Cardiology check-up',
      date,
      time: '14:00',
      withWhom: 'Dr. Patel',
      placeName: 'Heart Clinic',
      placeAddress: '400 Main St',
      driverName: 'Linda',
      pickupTime: '13:15',
      noteForSusan: 'Bring your list of medicines.',
      privateNotes: 'Ask about the new prescription.',
      reminders: [
        { shape: 'daysBefore', days: 1, time: '18:00' },
        { shape: 'before', amount: 2, unit: 'hours' },
      ],
    });
    renderApp(`/appointments/${appointment.id}`, { calendar });
    const list = await screen.findByRole('list', { name: 'Reminders' });
    const [dayBefore, twoHours] = within(list).getAllByRole('listitem');
    expect(within(dayBefore).getByText('The day before at 6:00 pm')).toBeInTheDocument();
    expect(within(dayBefore).getByText(goesOut(addDays(date, -1), '18:00'))).toBeInTheDocument();
    expect(
      within(dayBefore).getByText(
        "Susan's Calendar: Cardiology check-up with Dr. Patel, tomorrow at 2:00 pm, at Heart Clinic, 400 Main St. Linda picks you up at 1:15 pm. Bring your list of medicines.",
      ),
    ).toBeInTheDocument();
    expect(within(twoHours).getByText('2 hours before')).toBeInTheDocument();
    expect(within(twoHours).getByText(goesOut(date, '12:00'))).toBeInTheDocument();
    expect(within(twoHours).getByText(/today at 2:00 pm/)).toBeInTheDocument();
    expect(within(list).queryByText(/prescription/)).not.toBeInTheDocument();
  });

  it('say so when there are none', async () => {
    const calendar = emptyCalendar();
    const appointment = await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: daysFromToday(2),
      time: '11:00',
      reminders: [],
    });
    renderApp(`/appointments/${appointment.id}`, { calendar });
    expect(
      await screen.findByText('No Reminders. Susan will not be texted about this Appointment.'),
    ).toBeInTheDocument();
  });
});

describe('the next-Appointment card on Upcoming', () => {
  async function upcoming(reminders: NonNullable<Parameters<typeof calendarWith>[0]>) {
    renderApp('/', { calendar: await calendarWith(reminders) });
    return within(await screen.findByRole('region', { name: 'Next up' })).getByRole('link');
  }
  async function calendarWith(
    reminders: Parameters<
      ReturnType<typeof emptyCalendar>['core']['addAppointment']
    >[1]['reminders'],
  ) {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, {
      what: 'Cardiology check-up',
      date: daysFromToday(2),
      time: '14:00',
      reminders,
    });
    return calendar;
  }
  const today = daysFromToday(0);

  it.each(['phone', 'desktop'] as const)(
    'shows the Reminders still to be sent, at %s width',
    async (width) => {
      atWidth(width);
      const card = await upcoming([
        // Already passed: not shown.
        { shape: 'daysBefore', days: 3, time: '18:00' },
        { shape: 'daysBefore', days: 1, time: '18:00' },
        { shape: 'before', amount: 2, unit: 'hours' },
      ]);
      const list = within(card).getByRole('list', { name: 'Reminders still to be sent' });
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        `${dayInWords(daysFromToday(1), today)} at 6:00 pm`,
        `${dayInWords(daysFromToday(2), today)} at 12:00 pm`,
      ]);
    },
  );

  it('says so when no Reminder is still to be sent', async () => {
    const card = await upcoming([{ shape: 'daysBefore', days: 3, time: '18:00' }]);
    expect(within(card).getByText('No Reminder to be sent')).toBeInTheDocument();
    expect(within(card).queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('the list beneath the phone Month grid', () => {
  /** Each row under the grid, as the words on it, by what the Appointment is. */
  async function rows() {
    const region = await screen.findByRole('region', { name: 'Picked day' });
    return Object.fromEntries(
      within(region)
        .getAllByRole('listitem')
        .map((row) => [row.querySelector('strong')!.textContent, row.textContent]),
    );
  }

  async function month() {
    const calendar = emptyCalendar();
    const add = (what: string, days: number, time: string, more: object = {}) =>
      calendar.core.addAppointment(linda, { what, date: daysFromToday(days), time, ...more });
    await add('Two to send', 3, '14:00', {
      reminders: [
        { shape: 'daysBefore', days: 1, time: '18:00' },
        { shape: 'before', amount: 2, unit: 'hours' },
      ],
    });
    await add('One to send', 4, '09:00');
    await add('None set', 5, '10:00', { reminders: [] });
    await add('All passed', 2, '10:00', {
      reminders: [{ shape: 'daysBefore', days: 3, time: '18:00' }],
    });
    const cancelled = await add('Called off', 6, '10:00');
    await calendar.core.cancelAppointment(mark, cancelled.id);
    // Started at midnight today. Its exact-time Reminder, kept from when it was later, is still
    // to come, but the Appointment has begun.
    const started = await add('Already started', 1, '12:00', {
      reminders: [{ shape: 'at', date: daysFromToday(1), time: '09:00' }],
    });
    await calendar.core.changeAppointment(mark, started.id, {
      date: daysFromToday(0),
      time: '00:00',
    });
    return calendar;
  }

  it('says how many Reminders are still to be sent for each Appointment to come', async () => {
    renderApp('/month', { calendar: await month() });
    const shown = await rows();
    expect(shown['Two to send']).toMatch(/2 Reminders to send$/);
    expect(shown['One to send']).toMatch(/1 Reminder to send$/);
  });

  it('says nothing for one with none left to send, one cancelled, or one that has started', async () => {
    renderApp('/month', { calendar: await month() });
    const shown = await rows();
    for (const what of ['None set', 'All passed', 'Called off', 'Already started'])
      expect(shown[what]).not.toMatch(/to send/);
  });

  it('gives only the count: the times stay on the Upcoming card and the Appointment', async () => {
    renderApp('/month', { calendar: await month() });
    const region = await screen.findByRole('region', { name: 'Picked day' });
    expect(within(region).queryByRole('list', { name: 'Reminders still to be sent' })).toBeNull();
    expect(region).not.toHaveTextContent(/ at \d+:\d\d [ap]m/);
  });

  it('is not part of the desktop Month grid', async () => {
    atWidth('desktop');
    renderApp('/month', { calendar: await month() });
    await screen.findByRole('table');
    expect(screen.queryByText(/Reminders? to send/)).not.toBeInTheDocument();
  });
});
