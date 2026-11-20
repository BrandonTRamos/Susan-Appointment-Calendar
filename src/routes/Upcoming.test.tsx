// @vitest-environment jsdom
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSampleCalendar } from '../data/sampleCalendar';
import { dateParts, dayInWords } from '../lib/localTime';
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

/** The next Appointment's card, which opens it. */
const nextCard = async () =>
  within(await screen.findByRole('region', { name: 'Next up' })).getByRole('link');

/** The later Appointments, top to bottom, each as the words on its row. */
const laterRows = async () =>
  within(await screen.findByRole('list', { name: 'Later Appointments' }))
    .getAllByRole('listitem')
    .map((row) => row.textContent);

/** Every Appointment shown, top to bottom: the card, then the later ones. */
const shown = async () => {
  const card = (await nextCard()).textContent;
  const later = screen.queryByRole('list', { name: 'Later Appointments' }) ? await laterRows() : [];
  return [card, ...later];
};

/** A date as a later row starts with it: weekday, day of the month, month. */
const dateOnRow = (date: string) => {
  const { weekday, month, day } = dateParts(date);
  return `${weekday}${day}${month}`;
};

const checkUp = {
  what: 'Cardiology check-up',
  time: '14:00',
  withWhom: 'Dr. Patel',
  placeName: 'Heart Clinic',
  placeAddress: '400 Main St',
  driverName: 'Linda',
  pickupTime: '13:15',
};

describe('the next Appointment, on a phone', () => {
  it('is a card with the day in words, the time, what it is, who with, where and the Driver', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, { ...checkUp, date: daysFromToday(1) });
    await calendar.core.addAppointment(mark, {
      what: 'Eye exam',
      date: daysFromToday(12),
      time: '15:30',
    });
    renderApp('/', { calendar });

    const card = await nextCard();
    expect(
      within(card).getByText(dayInWords(daysFromToday(1), daysFromToday(0))),
    ).toHaveTextContent(/^Tomorrow · /);
    expect(within(card).getByText('2:00 pm')).toBeInTheDocument();
    expect(within(card).getByText('Cardiology check-up')).toBeInTheDocument();
    expect(within(card).getByText('Dr. Patel · Heart Clinic, 400 Main St')).toBeInTheDocument();
    expect(within(card).getByText('Linda picks up at 1:15 pm')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('Eye exam');
  });

  it('says Today for one today, and the weekday and date for one further ahead', async () => {
    const calendar = emptyCalendar();
    const { id } = await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: daysFromToday(0),
      time: '23:59',
    });
    renderApp('/', { calendar });
    expect(await nextCard()).toHaveTextContent(/^Today · /);

    await act(() => calendar.core.changeAppointment(linda, id, { date: daysFromToday(4) }));
    expect(await nextCard()).toHaveTextContent(
      new RegExp(`^${dayInWords(daysFromToday(4), daysFromToday(0))}11:59 pm`),
    );
  });

  it('says who is driving when there is no pickup time, and leaves out what it does not have', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: daysFromToday(2),
      time: '11:00',
      driverName: 'Mark',
    });
    renderApp('/', { calendar });
    const card = await nextCard();
    expect(within(card).getByText('Mark is driving')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('·  ·');
    expect(card.textContent).toBe(
      `${dayInWords(daysFromToday(2), daysFromToday(0))}11:00 amHairMark is driving` +
        // The Reminder it started with, still to be sent.
        `Reminder${dayInWords(daysFromToday(1), daysFromToday(0))} at 6:00 pm`,
    );
  });

  it('leaves out a Reminder whose words hold a web address: it will not be sent', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: daysFromToday(2),
      time: '11:00',
      reminders: [
        { shape: 'daysBefore', days: 1, time: '18:00' },
        { shape: 'before', amount: 2, unit: 'hours' },
      ],
    });
    const blocked = await calendar.core.addAppointment(linda, {
      what: 'Eye exam',
      date: daysFromToday(1),
      time: '15:30',
      noteForSusan: 'Check in at example.de',
    });
    renderApp('/', { calendar });
    // The Eye exam is next, and its only Reminder would hold the address.
    const card = await nextCard();
    expect(card).toHaveTextContent(/Eye exam/);
    expect(within(card).getByText('No Reminder to be sent')).toBeInTheDocument();
    expect(within(card).queryByRole('list', { name: 'Reminders still to be sent' })).toBeNull();
    // Once the address is out, it is to be sent again.
    await act(() =>
      calendar.core.changeAppointment(linda, blocked.id, { noteForSusan: 'Check in first' }),
    );
    expect(
      within(await nextCard()).getByRole('list', { name: 'Reminders still to be sent' }),
    ).toBeInTheDocument();
  });

  it('opens the Appointment', async () => {
    const calendar = emptyCalendar();
    const { id } = await calendar.core.addAppointment(linda, {
      ...checkUp,
      date: daysFromToday(1),
    });
    renderApp('/', { calendar });
    expect(await nextCard()).toHaveAttribute('href', `/appointments/${id}`);
  });
});

describe('the later Appointments', () => {
  it('follow the card in date order, one row each, starting with the date', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, {
      what: 'Eye exam',
      date: daysFromToday(12),
      time: '15:30',
      withWhom: 'Dr. Chen',
    });
    await calendar.core.addAppointment(linda, { ...checkUp, date: daysFromToday(1) });
    await calendar.core.addAppointment(mark, {
      what: 'Blood draw',
      date: daysFromToday(1),
      time: '09:00',
      placeName: 'Riverside Lab',
    });
    await calendar.core.addAppointment(mark, {
      what: 'Flu shot',
      date: daysFromToday(-1),
      time: '10:30',
    });
    renderApp('/', { calendar });

    expect(await nextCard()).toHaveTextContent('Blood draw');
    const later = await laterRows();
    expect(later).toEqual([
      `${dateOnRow(daysFromToday(1))}Cardiology check-up2:00 pm · Dr. Patel · Heart Clinic`,
      `${dateOnRow(daysFromToday(12))}Eye exam3:30 pm · Dr. Chen`,
    ]);
    expect(screen.queryByText('Flu shot')).not.toBeInTheDocument();
  });

  it('open from their rows', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, { ...checkUp, date: daysFromToday(1) });
    const { id } = await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: daysFromToday(3),
      time: '11:00',
    });
    renderApp('/', { calendar });
    expect(await screen.findByRole('link', { name: /Hair/ })).toHaveAttribute(
      'href',
      `/appointments/${id}`,
    );
  });
});

describe('Upcoming', () => {
  it('still shows an Appointment from earlier today', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, {
      what: 'Breakfast with Mark',
      date: daysFromToday(0),
      time: '00:00',
    });
    renderApp('/', { calendar });
    expect(await nextCard()).toHaveTextContent('Breakfast with Mark');
  });

  it('says so plainly when nothing is coming up, and offers to add an Appointment', async () => {
    renderApp('/');
    expect(await screen.findByText('No upcoming Appointments.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Next up' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Add an Appointment' }));
    expect(window.location.pathname).toBe('/appointments/new');
  });

  it('does not show cancelled Appointments', async () => {
    const calendar = emptyCalendar();
    const hair = await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: daysFromToday(1),
      time: '11:00',
    });
    await calendar.core.addAppointment(linda, {
      what: 'Eye exam',
      date: daysFromToday(3),
      time: '15:30',
    });
    const lunch = await calendar.core.addAppointment(linda, {
      what: 'Lunch',
      date: daysFromToday(5),
      time: '12:00',
    });
    await calendar.core.cancelAppointment(mark, hair.id);
    await calendar.core.cancelAppointment(mark, lunch.id);
    renderApp('/', { calendar });
    expect(await nextCard()).toHaveTextContent('Eye exam');
    expect(screen.queryByRole('list', { name: 'Later Appointments' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Hair|Lunch/)).not.toBeInTheDocument();
  });
});

describe('on a phone', () => {
  it('opens an Appointment as a full screen, with a way back', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, { ...checkUp, date: daysFromToday(1) });
    renderApp('/', { calendar });
    await userEvent.click(await nextCard());
    expect(
      screen.getByRole('heading', { level: 1, name: 'Cardiology check-up' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Next up' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back to Upcoming' }));
    expect(await nextCard()).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('opens the Appointment form as a full screen', async () => {
    renderApp('/');
    await userEvent.click(await screen.findByRole('link', { name: 'New Appointment' }));
    expect(screen.getByRole('heading', { level: 1, name: 'New Appointment' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });
});

describe('on a desktop', () => {
  beforeEach(() => atWidth('desktop'));
  const panel = () => screen.getByRole('complementary', { name: 'Appointment details' });

  it('picks the next Appointment on arrival and shows it in the panel, with Edit, Cancel and who added it', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, { ...checkUp, date: daysFromToday(1) });
    await calendar.core.addAppointment(mark, {
      what: 'Hair',
      date: daysFromToday(3),
      time: '11:00',
    });
    renderApp('/', { calendar });

    expect(
      await within(panel()).findByRole('heading', { level: 2, name: 'Cardiology check-up' }),
    ).toBeInTheDocument();
    expect(within(panel()).getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: 'Cancel Appointment' })).toBeInTheDocument();
    expect(within(panel()).getByText(/^Added by Linda on /)).toBeInTheDocument();
    expect(await nextCard()).toHaveAttribute('aria-current', 'true');
    expect(window.location.pathname).toBe('/');
  });

  it('shows a picked Appointment in the panel and keeps Upcoming in the middle', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, { ...checkUp, date: daysFromToday(1) });
    const hair = await calendar.core.addAppointment(mark, {
      what: 'Hair',
      date: daysFromToday(3),
      time: '11:00',
    });
    renderApp('/', { calendar });
    await userEvent.click(await screen.findByRole('link', { name: /Hair/ }));

    expect(window.location.pathname).toBe(`/appointments/${hair.id}`);
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Hair' })).toBeInTheDocument();
    expect(within(panel()).getByText(/^Added by Mark on /)).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'Upcoming' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Hair/ })).toHaveAttribute('aria-current', 'true');
    expect(await nextCard()).not.toHaveAttribute('aria-current');
  });

  it('opens the Appointment form in the panel, for a new one and for a change', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, { ...checkUp, date: daysFromToday(1) });
    renderApp('/', { calendar });
    await userEvent.click(screen.getByRole('link', { name: 'New Appointment' }));
    expect(
      within(panel()).getByRole('heading', { level: 2, name: 'New Appointment' }),
    ).toBeInTheDocument();
    expect(within(panel()).getByLabelText('What it is')).toBeInTheDocument();
    expect(await nextCard()).toHaveTextContent('Cardiology check-up');

    await userEvent.click(within(panel()).getByRole('link', { name: 'Back without saving' }));
    await userEvent.click(await within(panel()).findByRole('link', { name: 'Edit' }));
    expect(
      within(panel()).getByRole('heading', { level: 2, name: 'Change Appointment' }),
    ).toBeInTheDocument();
    expect(within(panel()).getByLabelText('What it is')).toHaveValue('Cardiology check-up');
  });

  it('says so plainly when nothing is coming up', async () => {
    renderApp('/');
    expect(await screen.findByText('No upcoming Appointments.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add an Appointment' })).toBeInTheDocument();
    expect(within(panel()).queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('a change made by someone else', () => {
  it('appears in the list without a reload', async () => {
    const calendar = emptyCalendar();
    renderApp('/', { calendar });
    expect(await screen.findByText('No upcoming Appointments.')).toBeInTheDocument();

    // Mark adds one from his own phone.
    const added = await act(() =>
      calendar.core.addAppointment(mark, { what: 'Hair', date: daysFromToday(3), time: '11:00' }),
    );
    expect((await shown())[0]).toMatch(/11:00 am.*Hair/);

    await act(() => calendar.core.changeAppointment(mark, added.id, { time: '13:45' }));
    expect((await shown())[0]).toMatch(/1:45 pm.*Hair/);

    await act(() => calendar.core.cancelAppointment(linda, added.id));
    expect(await screen.findByText('No upcoming Appointments.')).toBeInTheDocument();

    await act(() => calendar.core.deleteAppointment(linda, added.id));
    expect(await screen.findByText('No upcoming Appointments.')).toBeInTheDocument();
  });
});

describe('on sample data', () => {
  it('lists invented Appointments, and none that have passed', async () => {
    renderApp('/', { calendar: createSampleCalendar(EASTERN), sampleData: true });
    const listed = await shown();
    expect(
      listed.map((row) => /Cardiology check-up|Blood draw|Hair|Eye exam/.exec(row!)?.[0]),
    ).toEqual(['Cardiology check-up', 'Blood draw', 'Hair', 'Eye exam']);
    expect(screen.queryByText('Flu shot')).not.toBeInTheDocument();
  });
});

describe('when the calendar cannot be read', () => {
  it('says so, and reads it again when asked', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: daysFromToday(3),
      time: '11:00',
    });
    const { watchAppointments } = calendar;
    let offline = true;
    calendar.watchAppointments = (listener, onError) => {
      if (!offline) return watchAppointments(listener, onError);
      queueMicrotask(() => onError(new Error('offline')));
      return () => {};
    };
    renderApp('/', { calendar });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the calendar');
    expect(screen.queryByText('No upcoming Appointments.')).not.toBeInTheDocument();

    offline = false;
    await act(async () => screen.getByRole('button', { name: 'Try again' }).click());
    expect((await shown())[0]).toContain('Hair');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps saying the list may be out of date until it is read again', async () => {
    const calendar = emptyCalendar();
    const { watchAppointments } = calendar;
    let fail: (error: Error) => void = () => {};
    calendar.watchAppointments = (listener, onError) => {
      fail = onError;
      return watchAppointments(listener, onError);
    };
    renderApp('/', { calendar });
    await screen.findByText('No upcoming Appointments.');
    await act(async () => fail(new Error('Connection closed')));
    expect(screen.getByRole('alert')).toHaveTextContent('This may be out of date');

    // One more change is heard of, but that does not mean changes are being heard again.
    await act(() =>
      calendar.core.addAppointment(mark, { what: 'Hair', date: daysFromToday(3), time: '11:00' }),
    );
    expect((await shown())[0]).toContain('Hair');
    expect(screen.getByRole('alert')).toHaveTextContent('This may be out of date');

    await act(async () => screen.getByRole('button', { name: 'Try again' }).click());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect((await shown())[0]).toContain('Hair');
  });
});
