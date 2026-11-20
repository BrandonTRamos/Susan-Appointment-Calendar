// @vitest-environment jsdom
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixedClock } from '../lib/calendar';
import { createSampleCalendar } from '../data/sampleCalendar';
import { formatDate } from '../lib/localTime';
import { atWidth, daysFromToday, EASTERN, linda, mark, renderApp } from '../test/renderApp';

const realMatchMedia = window.matchMedia;
beforeEach(() => atWidth('phone'));
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

const everyDetail = () => ({
  what: 'Cardiology check-up',
  date: daysFromToday(4),
  time: '14:00',
  withWhom: 'Dr. Patel',
  placeName: 'Heart Clinic',
  placeAddress: '400 Main St',
  driverName: 'Linda',
  pickupTime: '13:15',
  noteForSusan: 'Bring your list of medicines.',
  privateNotes: 'Ask about the new prescription.',
});

/** A calendar whose clock a test can move, holding one Appointment that Linda added. */
async function withAppointment(details: ReturnType<typeof everyDetail> | object = everyDetail()) {
  // 19 November 2026, 3:15 pm for Susan; 9:15 am the next morning where the tests run.
  const clock = createFixedClock('2026-11-19T20:15:00.000Z');
  const calendar = createSampleCalendar(EASTERN, { empty: true, clock });
  const appointment = await calendar.core.addAppointment(linda, {
    ...everyDetail(),
    ...details,
  });
  return { calendar, clock, appointment };
}

/** What is written beside a label in the details. */
const detail = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

describe('opening an Appointment', () => {
  it('shows all its details', async () => {
    const { calendar, appointment } = await withAppointment();
    renderApp(`/appointments/${appointment.id}`, { calendar });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' }),
    ).toBeInTheDocument();
    expect(detail('When')).toBe(`${formatDate(appointment.date)} at 2:00 pm`);
    expect(detail('With')).toBe('Dr. Patel');
    expect(detail('Where')).toBe('Heart Clinic400 Main St');
    expect(detail('Driver')).toBe('Linda, picking Susan up at 1:15 pm');
    expect(detail('Note for Susan')).toBe('Bring your list of medicines.');
    expect(detail('Private notes')).toBe('Ask about the new prescription.');
  });

  it('leaves out the details it does not have', async () => {
    const { calendar, appointment } = await withAppointment({
      withWhom: null,
      placeName: null,
      placeAddress: null,
      driverName: null,
      pickupTime: '13:15',
      noteForSusan: null,
      privateNotes: null,
    });
    renderApp(`/appointments/${appointment.id}`, { calendar });
    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(['When', 'Pickup']);
    expect(detail('Pickup')).toBe('1:15 pm');
  });

  it("shows who added it and who last changed it, and when, in Susan's local time", async () => {
    const { calendar, clock, appointment } = await withAppointment();
    renderApp(`/appointments/${appointment.id}`, { calendar });
    expect(
      await screen.findByText('Added by Linda on Thu, Nov 19, 2026 at 3:15 pm'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Last changed/)).not.toBeInTheDocument();

    // Mark changes it late that evening, her time: already the next day in UTC.
    clock.set('2026-11-20T04:40:00.000Z');
    await act(() => calendar.core.changeAppointment(mark, appointment.id, { time: '15:30' }));
    expect(
      await screen.findByText('Last changed by Mark on Thu, Nov 19, 2026 at 11:40 pm'),
    ).toBeInTheDocument();
    expect(screen.getByText('Added by Linda on Thu, Nov 19, 2026 at 3:15 pm')).toBeInTheDocument();
    expect(detail('When')).toBe(`${formatDate(appointment.date)} at 3:30 pm`);
  });

  it('says when a change came through an agent', async () => {
    const { calendar, appointment } = await withAppointment();
    await calendar.core.changeAppointment({ ...mark, viaAgent: true }, appointment.id, {
      time: '15:30',
    });
    renderApp(`/appointments/${appointment.id}`, { calendar });
    expect(await screen.findByText(/^Last changed by Mark \(via agent\) on /)).toBeInTheDocument();
    expect(screen.getByText(/^Added by Linda on /)).toBeInTheDocument();
  });

  it('says so when the calendar has no such Appointment', async () => {
    const { calendar } = await withAppointment();
    renderApp('/appointments/no-such-appointment', { calendar });
    expect(
      await screen.findByText('This Appointment is not in the calendar. It may have been deleted.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Upcoming' })).toHaveAttribute('href', '/');
  });

  it('leads to the form for changing it', async () => {
    const { calendar, appointment } = await withAppointment();
    renderApp(`/appointments/${appointment.id}`, { calendar });
    await userEvent.click(await screen.findByRole('link', { name: 'Edit' }));
    expect(window.location.pathname).toBe(`/appointments/${appointment.id}/edit`);
    expect(screen.getByLabelText('What it is')).toHaveValue('Cardiology check-up');
  });
});

describe('cancelling an Appointment', () => {
  it('asks first, then keeps it, marked cancelled', async () => {
    const { calendar, appointment } = await withAppointment();
    renderApp(`/appointments/${appointment.id}`, { calendar });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel Appointment' }));
    const question = screen.getByRole('group', { name: 'Cancel this Appointment?' });
    expect(calendar.store.appointments()[0].state).toBe('active');

    await userEvent.click(within(question).getByRole('button', { name: 'Yes, cancel it' }));
    expect(await screen.findByText('Cancelled', { selector: '.badge' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Cardiology check-up' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Cancelled by You on /)).toBeInTheDocument();
    expect(detail('With')).toBe('Dr. Patel');
    expect(calendar.store.appointments()).toMatchObject([
      { id: appointment.id, state: 'cancelled' },
    ]);

    // A cancelled Appointment can no longer be changed or cancelled, only deleted.
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Appointment' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Appointment' })).toBeInTheDocument();
  });

  it('does nothing when the person decides to keep it', async () => {
    const { calendar, appointment } = await withAppointment();
    renderApp(`/appointments/${appointment.id}`, { calendar });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel Appointment' }));
    await userEvent.click(screen.getByRole('button', { name: 'No, keep it' }));
    expect(
      screen.queryByRole('group', { name: 'Cancel this Appointment?' }),
    ).not.toBeInTheDocument();
    expect(calendar.store.appointments()).toEqual([appointment]);
  });
});

describe('deleting an Appointment entered by mistake', () => {
  it('asks first, then removes it and goes back to Upcoming', async () => {
    const { calendar, appointment } = await withAppointment();
    renderApp(`/appointments/${appointment.id}`, { calendar });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Appointment' }));
    const question = screen.getByRole('group', { name: 'Delete this Appointment?' });
    expect(calendar.store.appointments()).toHaveLength(1);

    await userEvent.click(within(question).getByRole('button', { name: 'Yes, delete it' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: "Susan's Calendar" }),
    ).toBeInTheDocument();
    expect(await screen.findByText('No upcoming Appointments.')).toBeInTheDocument();
    expect(calendar.store.appointments()).toEqual([]);
  });

  it('does not call it missing while the delete is still on its way back', async () => {
    const { calendar, appointment } = await withAppointment();
    const { deleteAppointment } = calendar;
    let answer!: () => void;
    // Over the data API the Appointment is seen to go a moment before the command answers.
    calendar.deleteAppointment = async (id) => {
      await deleteAppointment(id);
      await new Promise<void>((resolve) => (answer = resolve));
    };
    renderApp(`/appointments/${appointment.id}`, { calendar });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Appointment' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    await screen.findByRole('heading', { level: 1, name: 'Appointment' });
    expect(screen.queryByText(/not in the calendar/)).not.toBeInTheDocument();
    await act(async () => answer());
    expect(
      await screen.findByRole('heading', { level: 1, name: "Susan's Calendar" }),
    ).toBeInTheDocument();
  });

  it('is refused once Susan has been texted about it, and says to cancel instead', async () => {
    const { calendar, appointment } = await withAppointment();
    calendar.store.noteTextSentAbout(appointment.id);
    renderApp(`/appointments/${appointment.id}`, { calendar });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Appointment' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Susan has already been texted about this Appointment, so it cannot be deleted. Cancel it instead.',
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Cardiology check-up' }),
    ).toBeInTheDocument();
    expect(calendar.store.appointments()).toEqual([appointment]);
  });
});

describe('while someone is looking at an Appointment', () => {
  it("someone else's cancellation and deletion show without a reload", async () => {
    const { calendar, appointment } = await withAppointment();
    renderApp(`/appointments/${appointment.id}`, { calendar });
    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });

    await act(() => calendar.core.cancelAppointment(mark, appointment.id));
    expect(await screen.findByText(/^Cancelled by Mark on /)).toBeInTheDocument();

    await act(() => calendar.core.deleteAppointment(mark, appointment.id));
    expect(
      await screen.findByText('This Appointment is not in the calendar. It may have been deleted.'),
    ).toBeInTheDocument();
  });
});
