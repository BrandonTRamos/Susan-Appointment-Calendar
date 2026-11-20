import { useCalendar } from '../data/CalendarContext';
import { remindersStillToSend, type Appointment } from '../lib/calendar';
import { dayInWords, formatTime, localDateTime } from '../lib/localTime';
import { useToday } from '../lib/useToday';

/**
 * The Reminders still to be sent for an Appointment, on the next-Appointment card on Upcoming:
 * when each goes out, in Susan's local time, or that none will. One whose words hold a web address
 * is left out: it will not be sent.
 */
export function RemindersToSend({ appointment }: { appointment: Appointment }) {
  const { timeZone } = useCalendar();
  const today = useToday(timeZone);
  const toSend = remindersStillToSend(appointment, new Date(), timeZone);

  if (toSend.length === 0) return <p className="next-reminders muted">No Reminder to be sent</p>;
  return (
    <div className="next-reminders">
      <p className="muted">{toSend.length === 1 ? 'Reminder' : 'Reminders'}</p>
      <ul aria-label="Reminders still to be sent">
        {toSend.map((reminder) => {
          const { date, time } = localDateTime(new Date(reminder.dueAt), timeZone);
          return <li key={reminder.id}>{`${dayInWords(date, today)} at ${formatTime(time)}`}</li>;
        })}
      </ul>
    </div>
  );
}

/**
 * How many Reminders are still to be sent for an Appointment still to come, for a row in the list
 * beneath the phone Month grid: "2 Reminders to send". Nothing for one that has started, is
 * cancelled, or has none left to send. One whose words hold a web address is not counted.
 */
export function ReminderCount({ appointment }: { appointment: Appointment }) {
  const { timeZone } = useCalendar();
  const now = new Date();
  if (new Date(appointment.startsAt) <= now) return null;
  const count = remindersStillToSend(appointment, now, timeZone).length;
  if (count === 0) return null;
  return (
    <span className="reminder-count">{`${count} ${count === 1 ? 'Reminder' : 'Reminders'} to send`}</span>
  );
}
