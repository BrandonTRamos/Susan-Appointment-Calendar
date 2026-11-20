// @vitest-environment jsdom
import { act, cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSampleCalendar } from '../data/sampleCalendar';
import { formatDate } from '../lib/localTime';
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

/** The Appointments listed, top to bottom, each as the words on its row. */
const rows = async () =>
  within(await screen.findByRole('list', { name: 'Upcoming Appointments' }))
    .getAllByRole('listitem')
    .map((row) => row.textContent);

describe('the Upcoming list', () => {
  it('shows what is coming up in date order, each with its date and start time', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, {
      what: 'Eye exam',
      date: daysFromToday(12),
      time: '15:30',
      withWhom: 'Dr. Chen',
    });
    await calendar.core.addAppointment(linda, {
      what: 'Cardiology check-up',
      date: daysFromToday(1),
      time: '14:00',
      withWhom: 'Dr. Patel',
      placeName: 'Heart Clinic',
    });
    await calendar.core.addAppointment(mark, {
      what: 'Blood draw',
      date: daysFromToday(1),
      time: '09:00',
    });
    await calendar.core.addAppointment(mark, {
      what: 'Flu shot',
      date: daysFromToday(-1),
      time: '10:30',
    });
    renderApp('/', { calendar });

    const listed = await rows();
    expect(listed).toHaveLength(3);
    expect(listed[0]).toContain('Blood draw');
    expect(listed[0]).toContain(formatDate(daysFromToday(1), 'short'));
    expect(listed[0]).toContain('9:00 am');
    expect(listed[1]).toContain('2:00 pm');
    expect(listed[1]).toContain('Cardiology check-up');
    expect(listed[1]).toContain('Dr. Patel · Heart Clinic');
    expect(listed[2]).toContain(formatDate(daysFromToday(12), 'short'));
    expect(listed[2]).toContain('Eye exam');
    expect(screen.queryByText('Flu shot')).not.toBeInTheDocument();
  });

  it('still shows an Appointment from earlier today', async () => {
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, {
      what: 'Breakfast with Mark',
      date: daysFromToday(0),
      time: '00:00',
    });
    renderApp('/', { calendar });
    expect((await rows())[0]).toContain('Breakfast with Mark');
  });

  it('says so when nothing is coming up', async () => {
    renderApp('/');
    expect(await screen.findByText('No upcoming Appointments.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Upcoming Appointments' })).not.toBeInTheDocument();
  });

  it('keeps a cancelled Appointment, marked cancelled', async () => {
    const calendar = emptyCalendar();
    const { id } = await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: daysFromToday(3),
      time: '11:00',
    });
    await calendar.core.cancelAppointment(mark, id);
    renderApp('/', { calendar });
    expect((await rows())[0]).toMatch(/Hair.*Cancelled/);
  });

  it('opens an Appointment from its row', async () => {
    const calendar = emptyCalendar();
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

describe('a change made by someone else', () => {
  it('appears in the list without a reload', async () => {
    const calendar = emptyCalendar();
    renderApp('/', { calendar });
    expect(await screen.findByText('No upcoming Appointments.')).toBeInTheDocument();

    // Mark adds one from his own phone.
    const added = await act(() =>
      calendar.core.addAppointment(mark, { what: 'Hair', date: daysFromToday(3), time: '11:00' }),
    );
    expect((await rows())[0]).toMatch(/11:00 am.*Hair/);

    await act(() => calendar.core.changeAppointment(mark, added.id, { time: '13:45' }));
    expect((await rows())[0]).toMatch(/1:45 pm.*Hair/);

    await act(() => calendar.core.cancelAppointment(linda, added.id));
    expect((await rows())[0]).toMatch(/Hair.*Cancelled/);

    await act(() => calendar.core.deleteAppointment(linda, added.id));
    expect(await screen.findByText('No upcoming Appointments.')).toBeInTheDocument();
  });
});

describe('on sample data', () => {
  it('lists invented Appointments, and none that have passed', async () => {
    renderApp('/', { calendar: createSampleCalendar(EASTERN), sampleData: true });
    const listed = await rows();
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
    expect((await rows())[0]).toContain('Hair');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
