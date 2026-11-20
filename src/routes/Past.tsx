import { Link, useMatch } from 'react-router-dom';
import { CalendarLoading, CalendarTrouble } from '../components/CalendarTrouble';
import { Page } from '../components/Page';
import { RepeatMark } from '../components/RepeatMark';
import { useCalendar } from '../data/CalendarContext';
import { pastAppointments, type Appointment } from '../lib/calendar';
import { dateParts, formatTime } from '../lib/localTime';
import { useDesktopWidth } from '../lib/useDesktopWidth';
import { useToday } from '../lib/useToday';
import { joined } from './Upcoming';

/**
 * The Appointments that have already happened, newest first, cancelled ones marked as cancelled:
 * for "when did she last see the cardiologist?". A tab on a desktop; on a phone, whose tab bar has
 * no room for it, reached from the end of Upcoming and leading back there.
 */
export function Past() {
  const { appointments, failed, timeZone } = useCalendar();
  const today = useToday(timeZone);
  const desktop = useDesktopWidth();
  const opened = useMatch('/appointments/:id/*')?.params.id;
  const past = appointments && pastAppointments(appointments, today);

  return (
    <Page title="Past" back={desktop ? undefined : { to: '/', label: 'Back to Upcoming' }}>
      <CalendarTrouble />
      {!past && !failed && <CalendarLoading />}
      {past?.length === 0 && (
        <div className="card empty">
          <p>No past Appointments.</p>
        </div>
      )}
      {past && past.length > 0 && (
        <ul className="later" aria-label="Past Appointments">
          {past.map((appointment) => (
            <li key={appointment.id}>
              <PastRow appointment={appointment} today={today} picked={opened === appointment.id} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

/** A past Appointment: its date first, with the year when it was not this year, then the rest. */
function PastRow({
  appointment,
  today,
  picked,
}: {
  appointment: Appointment;
  today: string;
  picked: boolean;
}) {
  const desktop = useDesktopWidth();
  const { id, what, date, time, withWhom, placeName, state } = appointment;
  const { weekday, month, day } = dateParts(date);
  const year = date.slice(0, 4);
  const withAndWhere = joined(' · ', withWhom, placeName);

  return (
    <Link className="later-row" to={`/appointments/${id}`} aria-current={picked || undefined}>
      <span className="date-block">
        <span className="weekday">{weekday}</span>
        <span className="day">{day}</span>
        <span className="month">{month}</span>
        {year !== today.slice(0, 4) && <span className="month">{year}</span>}
      </span>
      <span className="row-main">
        {desktop && <span className="time">{formatTime(time)}</span>}
        <span className="row-what">
          <strong>{what}</strong>
          <span className="muted">
            {desktop ? withAndWhere : joined(' · ', formatTime(time), withAndWhere)}
          </span>
          <RepeatMark appointment={appointment} />
          {state === 'cancelled' && <span className="badge">Cancelled</span>}
        </span>
      </span>
    </Link>
  );
}
