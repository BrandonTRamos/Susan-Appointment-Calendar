// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatDate } from '../lib/localTime';
import { atWidth, daysFromToday, emptyCalendar, linda, renderApp } from '../test/renderApp';

const realMatchMedia = window.matchMedia;
beforeEach(() => atWidth('phone'));
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

const field = (name: string) => screen.getByLabelText(name);
const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('adding an Appointment', () => {
  it('takes just what it is, its date and its start time, and shows it in the calendar', async () => {
    const date = daysFromToday(4);
    const { calendar } = renderApp('/');
    await userEvent.click(await screen.findByRole('link', { name: 'New Appointment' }));
    await userEvent.type(field('What it is'), 'Cardiology check-up');
    await userEvent.type(field('Date'), date);
    await userEvent.type(field('Start time'), '14:00');
    await save();

    // It opens, as it was saved.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' }),
    ).toBeInTheDocument();
    expect(screen.getByText(`${formatDate(date)} at 2:00 pm`)).toBeInTheDocument();
    expect(screen.getByText(/^Added by You on /)).toBeInTheDocument();
    expect(calendar.store.appointments()).toMatchObject([
      { what: 'Cardiology check-up', date, time: '14:00', state: 'active', withWhom: null },
    ]);

    // And it is next on Upcoming.
    await userEvent.click(screen.getByRole('link', { name: 'Back to Upcoming' }));
    const next = await screen.findByRole('region', { name: 'Next up' });
    expect(within(next).getByRole('link', { name: /Cardiology check-up/ })).toBeInTheDocument();
  });

  it('takes who it is with, where, the Driver and pickup time, and both kinds of note', async () => {
    const date = daysFromToday(4);
    const { calendar } = renderApp('/appointments/new');
    await userEvent.type(field('What it is'), 'Cardiology check-up');
    await userEvent.type(field('Date'), date);
    await userEvent.type(field('Start time'), '14:00');
    await userEvent.type(field('Who it is with'), 'Dr. Patel');
    await userEvent.type(field('Place'), 'Heart Clinic');
    await userEvent.type(field('Address'), '400 Main St');
    await userEvent.type(field('Driver'), 'Linda');
    await userEvent.type(field('Pickup time'), '13:15');
    await userEvent.type(field('Note for Susan'), 'Bring your list of medicines.');
    await userEvent.type(field('Private notes'), 'Ask about the new prescription.');
    await save();

    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(calendar.store.appointments()).toMatchObject([
      {
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
      },
    ]);
  });

  it('warns, as it is typed, that a text holding a web address will not be sent, and saves it as typed', async () => {
    const date = daysFromToday(4);
    const { calendar } = renderApp('/appointments/new');
    await userEvent.type(field('What it is'), 'Cardiology check-up');
    await userEvent.type(field('Date'), date);
    await userEvent.type(field('Start time'), '14:00');
    expect(screen.queryByText(/holds a web address/)).not.toBeInTheDocument();
    await userEvent.type(field('Note for Susan'), 'Check in at example.de first.');
    expect(screen.getByText(/This text holds a web address, so it will not be sent/)).toBeTruthy();
    // A web address in the Private notes goes in no text, so nothing is said of it.
    await userEvent.clear(field('Note for Susan'));
    await userEvent.type(field('Private notes'), 'Portal: https://portal.example.com');
    expect(screen.queryByText(/holds a web address/)).not.toBeInTheDocument();
    await userEvent.type(field('Note for Susan'), 'Check in at example.de first.');
    await save();
    // Its one Reminder will not be sent, so the form asks first, as for an Appointment with none.
    await userEvent.click(screen.getByRole('button', { name: 'Save with no Reminder' }));
    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(calendar.store.appointments()).toMatchObject([
      { noteForSusan: 'Check in at example.de first.' },
    ]);
  });

  it('says what is missing and keeps what was typed', async () => {
    const { calendar } = renderApp('/appointments/new');
    await userEvent.type(field('Who it is with'), 'Dr. Patel');
    await save();
    expect(await screen.findByRole('alert')).toHaveTextContent('Say what the Appointment is.');
    expect(field('What it is')).toHaveAttribute('aria-invalid', 'true');
    expect(field('Who it is with')).toHaveValue('Dr. Patel');

    await userEvent.type(field('What it is'), 'Cardiology check-up');
    await save();
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick the date.');
    expect(field('What it is')).not.toHaveAttribute('aria-invalid', 'true');
    expect(window.location.pathname).toBe('/appointments/new');
    expect(calendar.store.appointments()).toEqual([]);
  });

  it("says every time is Susan's local time, and what each note is for", () => {
    renderApp('/appointments/new');
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe('America/New_York');
    expect(field('Start time')).toHaveAccessibleDescription(
      "Susan's local time (Eastern Time), wherever you are.",
    );
    expect(field('Note for Susan')).toHaveAccessibleDescription('Included in every Reminder.');
    expect(field('Private notes')).toHaveAccessibleDescription('Never sent in a text.');
  });

  it('says so when it could not be saved, and lets the person try again', async () => {
    const calendar = emptyCalendar();
    const { addAppointment } = calendar;
    let offline = true;
    calendar.addAppointment = (details) =>
      offline
        ? Promise.reject(
            new Error('Could not save the change. Check your connection and try again.'),
          )
        : addAppointment(details);
    renderApp('/appointments/new', { calendar });
    await userEvent.type(field('What it is'), 'Hair');
    await userEvent.type(field('Date'), daysFromToday(2));
    await userEvent.type(field('Start time'), '11:00');
    await save();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the change. Check your connection and try again.',
    );
    expect(field('What it is')).toHaveValue('Hair');

    offline = false;
    await save();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hair' })).toBeInTheDocument();
  });

  it('adds one Appointment when a save that worked is sent again', async () => {
    const calendar = emptyCalendar();
    const { addAppointment } = calendar;
    let answerLost = true;
    // The first save reaches the calendar, but its answer never comes back.
    calendar.addAppointment = async (details, id) => {
      const added = await addAppointment(details, id);
      if (!answerLost) return added;
      answerLost = false;
      throw new Error('Could not save the change. Check your connection and try again.');
    };
    renderApp('/appointments/new', { calendar });
    await userEvent.type(field('What it is'), 'Hair');
    await userEvent.type(field('Date'), daysFromToday(2));
    await userEvent.type(field('Start time'), '11:00');
    await save();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not save/);
    await save();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hair' })).toBeInTheDocument();
    expect(calendar.store.appointments()).toHaveLength(1);
    expect(calendar.store.activity()).toHaveLength(1);
  });

  it('goes back without saving', async () => {
    const { calendar } = renderApp('/appointments/new');
    await userEvent.type(field('What it is'), 'Hair');
    await userEvent.click(screen.getByRole('link', { name: 'Back without saving' }));
    expect(window.location.pathname).toBe('/');
    expect(calendar.store.appointments()).toEqual([]);
  });
});

describe('changing an Appointment', () => {
  async function editing() {
    const calendar = emptyCalendar();
    const appointment = await calendar.core.addAppointment(linda, {
      what: 'Cardiology check-up',
      date: daysFromToday(4),
      time: '14:00',
      withWhom: 'Dr. Patel',
      driverName: 'Linda',
      pickupTime: '13:15',
    });
    renderApp(`/appointments/${appointment.id}/edit`, { calendar });
    await screen.findByRole('heading', { level: 1, name: 'Change Appointment' });
    return { calendar, appointment };
  }

  it('opens with every detail as it is', async () => {
    const { appointment } = await editing();
    expect(field('What it is')).toHaveValue('Cardiology check-up');
    expect(field('Date')).toHaveValue(appointment.date);
    expect(field('Start time')).toHaveValue('14:00');
    expect(field('Who it is with')).toHaveValue('Dr. Patel');
    expect(field('Driver')).toHaveValue('Linda');
    expect(field('Pickup time')).toHaveValue('13:15');
    expect(field('Place')).toHaveValue('');
  });

  it('saves the change and shows who made it', async () => {
    const { calendar, appointment } = await editing();
    await userEvent.clear(field('Start time'));
    await userEvent.type(field('Start time'), '15:30');
    await userEvent.clear(field('Driver'));
    await save();

    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(window.location.pathname).toBe(`/appointments/${appointment.id}`);
    expect(screen.getByText(`${formatDate(appointment.date)} at 3:30 pm`)).toBeInTheDocument();
    expect(screen.getByText(/^Added by Linda on /)).toBeInTheDocument();
    expect(screen.getByText(/^Last changed by You on /)).toBeInTheDocument();
    expect(calendar.store.appointments()).toMatchObject([
      { time: '15:30', driverName: null, pickupTime: '13:15', withWhom: 'Dr. Patel' },
    ]);
  });

  it('leaves alone what this person did not touch, even if someone else changed it meanwhile', async () => {
    const { calendar, appointment } = await editing();
    // While the form is open, Linda moves the pickup from her own phone.
    await calendar.core.changeAppointment(linda, appointment.id, { pickupTime: '12:45' });
    await userEvent.type(field('Place'), 'Heart Clinic');
    await save();
    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(calendar.store.appointments()).toMatchObject([
      { placeName: 'Heart Clinic', pickupTime: '12:45' },
    ]);
  });

  it("changes nothing, and is nobody's change, when saved as it was", async () => {
    const { calendar, appointment } = await editing();
    await save();
    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(calendar.store.appointments()).toEqual([appointment]);
    expect(calendar.store.activity()).toHaveLength(1);
  });

  it('is not offered for a cancelled Appointment', async () => {
    const calendar = emptyCalendar();
    const { id } = await calendar.core.addAppointment(linda, {
      what: 'Hair',
      date: daysFromToday(2),
      time: '11:00',
    });
    await calendar.core.cancelAppointment(linda, id);
    renderApp(`/appointments/${id}/edit`, { calendar });
    expect(await screen.findByText(/is cancelled, so it cannot be changed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});

describe('an Appointment that overlaps another', () => {
  it('is saved, with a warning that names the other one', async () => {
    const date = daysFromToday(4);
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, { what: 'Blood draw', date, time: '14:00' });
    renderApp('/appointments/new', { calendar });
    await userEvent.type(field('What it is'), 'Cardiology check-up');
    await userEvent.type(field('Date'), date);
    await userEvent.type(field('Start time'), '14:30');
    await save();

    await screen.findByRole('heading', { level: 1, name: 'Cardiology check-up' });
    expect(screen.getByRole('note')).toHaveTextContent(
      `This overlaps Blood draw, ${formatDate(date, 'short')} at 2:00 pm.`,
    );
    expect(calendar.store.appointments()).toHaveLength(2);
  });

  it('is warned about when a change makes it overlap, and not once it no longer does', async () => {
    const date = daysFromToday(4);
    const calendar = emptyCalendar();
    await calendar.core.addAppointment(linda, { what: 'Blood draw', date, time: '09:00' });
    const { id } = await calendar.core.addAppointment(linda, { what: 'Hair', date, time: '11:00' });
    renderApp(`/appointments/${id}/edit`, { calendar });
    await userEvent.clear(await screen.findByLabelText('Start time'));
    await userEvent.type(field('Start time'), '09:45');
    await save();
    expect(await screen.findByRole('note')).toHaveTextContent(/This overlaps Blood draw/);

    await userEvent.click(screen.getByRole('link', { name: 'Edit' }));
    await userEvent.clear(field('Start time'));
    await userEvent.type(field('Start time'), '10:00');
    await save();
    await screen.findByRole('heading', { level: 1, name: 'Hair' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('is not warned about when the other one is cancelled', async () => {
    const date = daysFromToday(4);
    const calendar = emptyCalendar();
    const other = await calendar.core.addAppointment(linda, {
      what: 'Blood draw',
      date,
      time: '14:00',
    });
    await calendar.core.cancelAppointment(linda, other.id);
    const { id } = await calendar.core.addAppointment(linda, { what: 'Hair', date, time: '14:00' });
    renderApp(`/appointments/${id}`, { calendar });
    await screen.findByRole('heading', { level: 1, name: 'Hair' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
