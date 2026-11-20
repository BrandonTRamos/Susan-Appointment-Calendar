import { Link } from 'react-router-dom';
import { CalendarLoading, CalendarTrouble } from '../components/CalendarTrouble';
import { PlusIcon } from '../components/Icons';
import { Page } from '../components/Page';
import { useCalendar } from '../data/CalendarContext';
import { upcomingAppointments, type Appointment } from '../lib/calendar';
import { formatDate, formatTime } from '../lib/localTime';
import { useDesktopWidth } from '../lib/useDesktopWidth';
import { useToday } from '../lib/useToday';

/** A plain list of what is coming up. Ticket 06 gives it the chosen design. */
export function Upcoming() {
  const { appointments, failed, timeZone } = useCalendar();
  const today = useToday(timeZone);
  const desktop = useDesktopWidth();
  const upcoming = appointments && upcomingAppointments(appointments, today);

  return (
    <Page title="Upcoming">
      {/* The desktop layout has this in its sidebar. */}
      {!desktop && (
        <Link className="btn btn-primary" to="/appointments/new">
          <PlusIcon size={22} />
          New Appointment
        </Link>
      )}
      <CalendarTrouble />
      {!upcoming && !failed && <CalendarLoading />}
      {upcoming?.length === 0 && <p className="muted">No upcoming Appointments.</p>}
      {upcoming && upcoming.length > 0 && (
        <ul className="appointments" aria-label="Upcoming Appointments">
          {upcoming.map((appointment) => (
            <li key={appointment.id}>
              <Row appointment={appointment} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function Row({ appointment }: { appointment: Appointment }) {
  const { id, what, date, time, withWhom, placeName, state } = appointment;
  const withAndWhere = [withWhom, placeName].filter(Boolean).join(' · ');
  return (
    <Link className="appointment-row" to={`/appointments/${id}`}>
      <span className="when">
        {formatDate(date, 'short')} · {formatTime(time)}
      </span>{' '}
      <strong className={state === 'cancelled' ? 'what cancelled' : 'what'}>{what}</strong>{' '}
      {withAndWhere && <span className="muted">{withAndWhere}</span>}{' '}
      {state === 'cancelled' && <span className="badge">Cancelled</span>}
    </Link>
  );
}
