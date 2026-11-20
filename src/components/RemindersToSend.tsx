import { useCalendar } from '../data/CalendarContext';
import { remindersStillToSend, type Appointment } from '../lib/calendar';
import { dayInWords, formatTime, localDateTime } from '../lib/localTime';
import { useToday } from '../lib/useToday';

/**
 * The Reminders still to be sent for an Appointment, on the next-Appointment card on Upcoming:
 * when each goes out, in Susan's local time, or that none will.
 */
export function RemindersToSend({ appointment }: { appointment: Appointment }) {
  const { timeZone } = useCalendar();
  const today = useToday(timeZone);
  const toSend = remindersStillToSend(appointment, new Date());

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
