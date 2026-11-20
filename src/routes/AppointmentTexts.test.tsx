// @vitest-environment jsdom
import { act, cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSampleCalendar } from '../data/sampleCalendar';
import { changeNoticeOwed } from '../lib/calendar';
import { atWidth, daysFromToday, EASTERN, linda, renderApp, sentReminder } from '../test/renderApp';

const realMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

const MINUTE = 60_000;
/** Susan's clock time a number of minutes from now, 'HH:MM', with the date it falls on. */
function inMinutes(minutes: number) {
  const at = new Date(Date.now() + minutes * MINUTE);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: string) => parts.find((each) => each.type === type)!.value;
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}

/** Finds text in the Reminders list once the screen has read the calendar. */
const inReminders = async (words: string | RegExp) =>
  within(await screen.findByRole('list', { name: 'Reminders' })).findByText(words);
const texts = async () => within(await screen.findByRole('region', { name: 'Texts to Susan' }));

describe.each(['phone', 'desktop'] as const)(
  'the texts on an Appointment, at %s width',
  (width) => {
    beforeEach(() => atWidth(width));

    it('shows a Reminder still to come as waiting, and no text yet', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const added = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date: daysFromToday(4),
        time: '15:30',
      });
      renderApp(`/appointments/${added.id}`, { calendar });
      expect(await inReminders('Waiting')).toBeTruthy();
      expect(
        await (await texts()).findByText('No text about this Appointment has come due yet.'),
      ).toBeTruthy();
    });

    it('shows a Reminder that went out as sent, and the text with its words', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const added = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date: daysFromToday(4),
        time: '15:30',
      });
      const text = await sentReminder(calendar, added);
      renderApp(`/appointments/${added.id}`, { calendar });
      expect(await inReminders('Sent')).toBeTruthy();
      const list = within(await (await texts()).findByRole('list', { name: 'Texts to Susan' }));
      expect(list.getByText(/^, due /)).toBeTruthy();
      expect(list.getByText('Reminder')).toBeTruthy();
      expect(list.getByText('Sent')).toBeTruthy();
      expect(list.getByText(text.words)).toBeTruthy();
    });

    it('shows a Reminder that was delivered as delivered, and never says she read it', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const added = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date: daysFromToday(4),
        time: '15:30',
      });
      const text = await sentReminder(calendar, added);
      await calendar.store.replaceText({ ...text, status: 'delivered' });
      renderApp(`/appointments/${added.id}`, { calendar });
      expect(await inReminders('Delivered')).toBeTruthy();
      expect(await inReminders(/phone company accepted it for her phone/)).toBeTruthy();
      // "Delivered" means her phone company took it; nothing says she read, saw or opened it.
      expect(screen.queryByText(/read it|was read|has read|seen|opened/i)).not.toBeInTheDocument();
    });

    it('tells a text not confirmed delivered apart from one reported not delivered', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const unconfirmed = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date: daysFromToday(4),
        time: '15:30',
      });
      const undelivered = await calendar.core.addAppointment(linda, {
        what: 'Blood draw',
        date: daysFromToday(5),
        time: '09:00',
      });
      for (const [appointment, reason] of [
        [unconfirmed, 'unconfirmed'],
        [undelivered, 'undelivered'],
      ] as const) {
        const text = await sentReminder(calendar, appointment);
        await calendar.store.replaceText({ ...text, status: 'failed', reason });
      }
      renderApp(`/appointments/${unconfirmed.id}`, { calendar });
      expect(await inReminders('Failed')).toBeTruthy();
      expect(await inReminders(/^Not confirmed delivered/)).toBeTruthy();
      cleanup();
      renderApp(`/appointments/${undelivered.id}`, { calendar });
      expect(await inReminders('Failed')).toBeTruthy();
      expect(await inReminders(/reported that it was not delivered/)).toBeTruthy();
      expect(screen.queryByText(/Not confirmed delivered/)).not.toBeInTheDocument();
    });

    it('shows a Reminder whose words hold a web address as one that will not be sent, and why', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const added = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date: daysFromToday(4),
        time: '15:30',
        noteForSusan: 'Check in at www.example.com',
      });
      renderApp(`/appointments/${added.id}`, { calendar });
      expect(await inReminders('Will not be sent')).toBeTruthy();
      expect(await inReminders(/Its words hold a web address/)).toBeTruthy();
      expect(
        await inReminders(/This text holds a web address, so it will not be sent/),
      ).toBeTruthy();
      // The words are shown as they are, address and all.
      expect(await inReminders(/Check in at www\.example\.com/)).toBeTruthy();
    });

    it('shows a Reminder kept from going for a web address as not sent, and why', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const added = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date: daysFromToday(4),
        time: '15:30',
        noteForSusan: 'Check in at www.example.com',
      });
      const text = await sentReminder(calendar, added);
      await calendar.store.replaceText({
        ...text,
        status: 'notSent',
        reason: 'webAddress',
        attempts: 0,
      });
      renderApp(`/appointments/${added.id}`, { calendar });
      expect(await inReminders('Not sent')).toBeTruthy();
      expect(await inReminders(/^Its words held a web address/)).toBeTruthy();
    });

    it('shows a Reminder whose time had passed when it was set as not sent, and why', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const { date, time } = inMinutes(120);
      const added = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date,
        time,
        reminders: [{ shape: 'before', amount: 1, unit: 'days' }],
      });
      renderApp(`/appointments/${added.id}`, { calendar });
      expect(await inReminders(/Its time had already passed when it was set/)).toBeTruthy();
      expect(calendar.sender.taken()).toEqual([]);
    });

    it('shows a Reminder as sent as soon as it goes, while the Appointment is open', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const { date, time } = inMinutes(120);
      const added = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date,
        time,
        reminders: [{ shape: 'before', amount: 90, unit: 'minutes' }],
      });
      renderApp(`/appointments/${added.id}`, { calendar });
      expect(await inReminders('Waiting')).toBeTruthy();
      // Half an hour on, it is due: the run sends it and the screen hears of it.
      const later = createSampleCalendar(EASTERN, { empty: true });
      expect(later).toBeTruthy();
      await act(async () => {
        await calendar.store.claimText({
          id: `reminder:${added.id}:${added.reminders[0].id}:${added.reminders[0].dueAt}`,
          kind: 'reminder',
          appointmentId: added.id,
          reminderId: added.reminders[0].id,
          words: "Susan's Calendar: Eye exam, today.",
          dueAt: added.reminders[0].dueAt,
          status: 'sent',
          reason: null,
          attempts: 1,
          triedAt: added.reminders[0].dueAt,
          sentAt: added.reminders[0].dueAt,
          reference: null,
          creditLeft: null,
          told: { date: added.date, time: added.time, cancelled: false },
        });
      });
      expect(await inReminders('Sent')).toBeTruthy();
    });

    it('shows an exact-time Reminder flagged by a move as waiting for review, not plain waiting', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const added = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date: daysFromToday(4),
        time: '15:30',
        reminders: [{ shape: 'at', date: daysFromToday(4), time: '09:00' }],
      });
      await calendar.core.changeAppointment(linda, added.id, { time: '16:30' });
      renderApp(`/appointments/${added.id}`, { calendar });
      expect(await inReminders('Waiting for review')).toBeTruthy();
      expect(
        await inReminders(/goes out only once someone keeps its time or changes it/),
      ).toBeTruthy();
      expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
    });

    it('shows a Change notice still to go out, with its words, once a reminded Appointment moves', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const added = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date: daysFromToday(4),
        time: '15:30',
      });
      await sentReminder(calendar, added);
      await calendar.core.changeAppointment(linda, added.id, { time: '16:30' });
      renderApp(`/appointments/${added.id}`, { calendar });
      const list = within(await (await texts()).findByRole('list', { name: 'Texts to Susan' }));
      const [notice, reminder] = list.getAllByRole('listitem');
      expect(within(notice).getByText('Change notice')).toBeTruthy();
      expect(within(notice).getByText('Waiting')).toBeTruthy();
      expect(
        within(notice).getByText(
          /^Susan's Calendar: Change: Eye exam has moved from .* at 3:30 pm to .* at 4:30 pm\.$/,
        ),
      ).toBeTruthy();
      expect(within(reminder).getByText('Reminder')).toBeTruthy();
    });

    it('says a Change notice still to go out will not be sent when its words hold a web address', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const added = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date: daysFromToday(4),
        time: '15:30',
      });
      await sentReminder(calendar, added);
      await calendar.core.changeAppointment(linda, added.id, {
        time: '16:30',
        withWhom: 'eyes.example.com',
      });
      renderApp(`/appointments/${added.id}`, { calendar });
      const list = within(await (await texts()).findByRole('list', { name: 'Texts to Susan' }));
      const [notice] = list.getAllByRole('listitem');
      expect(within(notice).getByText('Change notice')).toBeTruthy();
      expect(within(notice).getByText('Will not be sent')).toBeTruthy();
      expect(within(notice).getByText(/texts to Susan cannot carry one/)).toBeTruthy();
    });

    it('shows a Change notice that went out with its status, like a Reminder', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const added = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date: daysFromToday(4),
        time: '15:30',
      });
      const reminder = await sentReminder(calendar, added);
      const words = "Susan's Calendar: Change: Eye exam, Monday at 3:30 pm, is cancelled.";
      const cancelled = await calendar.core.cancelAppointment(linda, added.id);
      // The notice the scheduled run would record, refused by the text sender.
      const owed = changeNoticeOwed(cancelled, [reminder], new Date(), EASTERN);
      await calendar.store.claimText({
        ...reminder,
        id: owed!.id,
        dueAt: owed!.dueAt,
        kind: 'changeNotice',
        reminderId: null,
        words,
        status: 'failed',
        reason: 'refused',
        told: { date: added.date, time: added.time, cancelled: true },
      });
      renderApp(`/appointments/${added.id}`, { calendar });
      const list = within(await (await texts()).findByRole('list', { name: 'Texts to Susan' }));
      expect(list.getAllByRole('listitem')).toHaveLength(2);
      expect(list.getByText('Change notice')).toBeTruthy();
      expect(list.getByText('Failed')).toBeTruthy();
      expect(list.getByText('The text was refused, so it did not go.')).toBeTruthy();
      expect(list.getByText(words)).toBeTruthy();
    });

    it('says a cancelled Appointment sends none', async () => {
      const calendar = createSampleCalendar(EASTERN, { empty: true });
      const added = await calendar.core.addAppointment(linda, {
        what: 'Eye exam',
        date: daysFromToday(4),
        time: '15:30',
      });
      await calendar.core.cancelAppointment(linda, added.id);
      renderApp(`/appointments/${added.id}`, { calendar });
      expect(await inReminders(/The Appointment is cancelled/)).toBeTruthy();
    });
  },
);

describe('a Reminder held for review since its Appointment moved', () => {
  /**
   * An Appointment in two days at 2:00 pm, with an exact-time Reminder the evening before and one
   * two hours before, then moved to 3:00 pm: the exact-time one is held for review.
   */
  async function moved() {
    const calendar = createSampleCalendar(EASTERN, { empty: true });
    const added = await calendar.core.addAppointment(linda, {
      what: 'Cardiology check-up',
      date: daysFromToday(2),
      time: '14:00',
      reminders: [
        { shape: 'at', date: daysFromToday(1), time: '18:00' },
        { shape: 'before', amount: 2, unit: 'hours' },
      ],
    });
    const after = await calendar.core.changeAppointment(linda, added.id, { time: '15:00' });
    expect(after.reminders.map((reminder) => reminder.needsReview)).toEqual([true, false]);
    return { calendar, appointment: after };
  }

  it.each(['phone', 'desktop'] as const)(
    'is not among the Reminders still to be sent on the Upcoming card, at %s width',
    async (width) => {
      atWidth(width);
      const { calendar } = await moved();
      renderApp('/', { calendar });
      const card = within(await screen.findByRole('region', { name: 'Next up' }));
      const list = within(card.getByRole('list', { name: 'Reminders still to be sent' }));
      expect(list.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        expect.stringMatching(/ at 1:00 pm$/),
      ]);
    },
  );

  it('is not counted beneath the phone Month grid', async () => {
    atWidth('phone');
    const { calendar } = await moved();
    renderApp('/month', { calendar });
    const region = within(await screen.findByRole('region', { name: 'Picked day' }));
    const row = region
      .getAllByRole('listitem')
      .find((each) => each.textContent?.includes('Cardiology check-up'));
    expect(row?.textContent).toMatch(/1 Reminder to send$/);
  });

  it('is still shown on the Appointment, as waiting for review', async () => {
    atWidth('phone');
    const { calendar, appointment } = await moved();
    renderApp(`/appointments/${appointment.id}`, { calendar });
    const list = within(await screen.findByRole('list', { name: 'Reminders' }));
    expect(list.getAllByRole('listitem')).toHaveLength(2);
    expect(list.getByText('Waiting for review')).toBeTruthy();
  });
});
