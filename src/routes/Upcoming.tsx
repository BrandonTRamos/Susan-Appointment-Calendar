import { useId } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { CalendarLoading, CalendarTrouble } from '../components/CalendarTrouble';
import { CarIcon, PersonIcon, PlaceIcon, PlusIcon } from '../components/Icons';
import { Page } from '../components/Page';
import { RemindersToSend } from '../components/RemindersToSend';
import { useCalendar } from '../data/CalendarContext';
import { upcomingAppointments, type Appointment } from '../lib/calendar';
import { dateParts, dayInWords, formatTime } from '../lib/localTime';
import { useDesktopWidth } from '../lib/useDesktopWidth';
import { useToday } from '../lib/useToday';

/**
 * The first screen: one large card for the next Appointment, then the later ones as a list, one
 * row each. Cancelled Appointments are not shown. On a desktop the picked Appointment is marked,
 * and is the next one until another is picked.
 */
export function Upcoming() {
  const { appointments, failed, timeZone } = useCalendar();
  const today = useToday(timeZone);
  const desktop = useDesktopWidth();
  const opened = useMatch('/appointments/:id/*')?.params.id;
  const upcoming = appointments && upcomingAppointments(appointments, today);
  const [next, ...later] = upcoming ?? [];
  const picked = desktop ? (opened ?? next?.id) : undefined;

  return (
    <Page
      title="Upcoming"
      // The desktop layout has this in its sidebar.
      action={
        !desktop && (
          <Link
            className="btn btn-primary btn-round"
            to="/appointments/new"
            aria-label="New Appointment"
          >
            <PlusIcon size={28} />
          </Link>
        )
      }
    >
      <CalendarTrouble />
      {!upcoming && !failed && <CalendarLoading />}
      {upcoming?.length === 0 && (
        <div className="card empty">
          <p>No upcoming Appointments.</p>
          <Link className="btn btn-primary" to="/appointments/new">
            <PlusIcon size={22} />
            Add an Appointment
          </Link>
        </div>
      )}
      {next && (
        <Section label="Next up">
          <NextCard appointment={next} today={today} picked={picked === next.id} />
        </Section>
      )}
      {later.length > 0 && (
        <Section label="Later">
          <ul className="later" aria-label="Later Appointments">
            {later.map((appointment) => (
              <li key={appointment.id}>
                <Row appointment={appointment} picked={picked === appointment.id} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section className="upcoming-section" aria-labelledby={id}>
      <h2 className="section-label" id={id}>
        {label}
      </h2>
      {children}
    </section>
  );
}

/** The Driver and pickup time as a sentence, or null when there is neither. */
function driverSentence({ driverName, pickupTime }: Appointment): string | null {
  if (driverName && pickupTime) return `${driverName} picks up at ${formatTime(pickupTime)}`;
  if (driverName) return `${driverName} is driving`;
  if (pickupTime) return `Pickup at ${formatTime(pickupTime)}`;
  return null;
}

const joined = (separator: string, ...parts: (string | null)[]) =>
  parts.filter(Boolean).join(separator);

/** The next Appointment in full: the day in words, the time in large type, and every detail. */
function NextCard({
  appointment,
  today,
  picked,
}: {
  appointment: Appointment;
  today: string;
  picked: boolean;
}) {
  const desktop = useDesktopWidth();
  const { id, what, date, time, withWhom, placeName, placeAddress } = appointment;
  const where = joined(', ', placeName, placeAddress);
  const driver = driverSentence(appointment);

  return (
    <Link className="next-card" to={`/appointments/${id}`} aria-current={picked || undefined}>
      <div className="next-when">
        <p className="next-day">{dayInWords(date, today)}</p>
        <p className="next-time">{formatTime(time)}</p>
      </div>
      <div className="next-what">
        <p className="next-title">{what}</p>
        {desktop ? (
          <>
            {withWhom && (
              <p className="with-icon muted">
                <PersonIcon size={22} />
                {withWhom}
              </p>
            )}
            {where && (
              <p className="with-icon muted">
                <PlaceIcon size={22} />
                {where}
              </p>
            )}
            {driver && (
              <p className="with-icon">
                <CarIcon size={22} />
                {driver}
              </p>
            )}
          </>
        ) : (
          <>
            {(withWhom || where) && <p className="muted">{joined(' · ', withWhom, where)}</p>}
            {driver && <p className="next-driver">{driver}</p>}
          </>
        )}
        <RemindersToSend appointment={appointment} />
      </div>
    </Link>
  );
}

/** A later Appointment: its date first, then what it is, its time, who with and where. */
function Row({ appointment, picked }: { appointment: Appointment; picked: boolean }) {
  const desktop = useDesktopWidth();
  const { id, what, date, time, withWhom, placeName } = appointment;
  const { weekday, month, day } = dateParts(date);
  const withAndWhere = joined(' · ', withWhom, placeName);

  return (
    <Link className="later-row" to={`/appointments/${id}`} aria-current={picked || undefined}>
      <span className="date-block">
        <span className="weekday">{weekday}</span>
        <span className="day">{day}</span>
        <span className="month">{month}</span>
      </span>
      <span className="row-main">
        {desktop && <span className="time">{formatTime(time)}</span>}
        <span className="row-what">
          <strong>{what}</strong>
          <span className="muted">
            {desktop ? withAndWhere : joined(' · ', formatTime(time), withAndWhere)}
          </span>
        </span>
      </span>
    </Link>
  );
}
