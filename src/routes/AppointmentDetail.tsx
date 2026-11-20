import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarLoading, CalendarTrouble } from '../components/CalendarTrouble';
import { Page } from '../components/Page';
import { useCalendar } from '../data/CalendarContext';
import type { Appointment, Stamp } from '../lib/calendar';
import { formatDate, formatMoment, formatTime } from '../lib/localTime';
import { ReminderList } from './AppointmentReminders';

/**
 * One Appointment: all its details, its Reminders and their words, who added it and who last
 * changed it, and Cancel and Delete.
 * Plain on purpose; ticket 06 gives it the chosen design.
 */
export function AppointmentDetail() {
  const { id } = useParams();
  const { appointments, failed } = useCalendar();
  const appointment = appointments?.find((each) => each.id === id);
  // Set while this person's own delete is being carried out: the Appointment can be gone from the
  // calendar a moment before the command answers, and that is not news to them.
  const [deleting, setDeleting] = useState(false);

  if (!appointment)
    return (
      <Page title="Appointment">
        <CalendarTrouble />
        {!appointments && !failed && <CalendarLoading />}
        {appointments && !deleting && <NotInCalendar />}
      </Page>
    );
  return <Detail key={appointment.id} appointment={appointment} onDeleting={setDeleting} />;
}

/** For an address whose Appointment the calendar does not have: deleted, or never there. */
export function NotInCalendar() {
  return (
    <>
      <p>This Appointment is not in the calendar. It may have been deleted.</p>
      <Link className="btn" to="/">
        Back to Upcoming
      </Link>
    </>
  );
}

function Detail({
  appointment,
  onDeleting,
}: {
  appointment: Appointment;
  onDeleting: (deleting: boolean) => void;
}) {
  const { client, timeZone } = useCalendar();
  const navigate = useNavigate();
  const [asking, setAsking] = useState<'cancel' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { id, what, date, time, state, added, lastChanged } = appointment;
  const { withWhom, placeName, placeAddress, driverName, pickupTime } = appointment;
  const cancelled = state === 'cancelled';

  /** Carries out a command, and says why if it was refused or failed. */
  async function carryOut(command: () => Promise<unknown>) {
    setBusy(true);
    setProblem(null);
    try {
      await command();
      setAsking(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const stamp = (did: string, { personName, viaAgent, at }: Stamp) =>
    `${did} by ${personName}${viaAgent ? ' (via agent)' : ''} on ${formatMoment(at, timeZone)}`;

  return (
    <Page title={what}>
      <CalendarTrouble />
      {cancelled && (
        <p>
          <span className="badge">Cancelled</span>
        </p>
      )}

      <dl className="details">
        <dt>When</dt>
        <dd>{`${formatDate(date)} at ${formatTime(time)}`}</dd>
        {withWhom && (
          <>
            <dt>With</dt>
            <dd>{withWhom}</dd>
          </>
        )}
        {(placeName || placeAddress) && (
          <>
            <dt>Where</dt>
            <dd>
              {placeName && <span>{placeName}</span>}
              {placeAddress && <span>{placeAddress}</span>}
            </dd>
          </>
        )}
        {driverName && (
          <>
            <dt>Driver</dt>
            <dd>
              {pickupTime
                ? `${driverName}, picking Susan up at ${formatTime(pickupTime)}`
                : driverName}
            </dd>
          </>
        )}
        {!driverName && pickupTime && (
          <>
            <dt>Pickup</dt>
            <dd>{formatTime(pickupTime)}</dd>
          </>
        )}
        {appointment.noteForSusan && (
          <>
            <dt>Note for Susan</dt>
            <dd className="words">{appointment.noteForSusan}</dd>
          </>
        )}
        {appointment.privateNotes && (
          <>
            <dt>Private notes</dt>
            <dd className="words">{appointment.privateNotes}</dd>
          </>
        )}
      </dl>

      <ReminderList appointment={appointment} timeZone={timeZone} now={new Date()} />

      <div className="stamps muted">
        <p>{stamp('Added', added)}</p>
        {lastChanged && <p>{stamp(cancelled ? 'Cancelled' : 'Last changed', lastChanged)}</p>}
      </div>

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}

      {asking === 'cancel' && (
        <div className="card confirm" role="group" aria-label="Cancel this Appointment?">
          <p>
            <strong>Cancel this Appointment?</strong> It stays in the calendar, marked cancelled.
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => carryOut(() => client.cancelAppointment(id))}
            >
              Yes, cancel it
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setAsking(null)}>
              No, keep it
            </button>
          </div>
        </div>
      )}
      {asking === 'delete' && (
        <div className="card confirm" role="group" aria-label="Delete this Appointment?">
          <p>
            <strong>Delete this Appointment?</strong> Deleting is for one entered by mistake. It is
            removed for good.
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() =>
                carryOut(async () => {
                  onDeleting(true);
                  try {
                    await client.deleteAppointment(id);
                    navigate('/', { replace: true });
                  } finally {
                    onDeleting(false);
                  }
                })
              }
            >
              Yes, delete it
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setAsking(null)}>
              No, keep it
            </button>
          </div>
        </div>
      )}

      {!asking && (
        <div className="actions">
          {!cancelled && (
            <Link className="btn btn-primary" to={`/appointments/${id}/edit`}>
              Edit
            </Link>
          )}
          {!cancelled && (
            <button type="button" className="btn" onClick={() => setAsking('cancel')}>
              Cancel Appointment
            </button>
          )}
          <button type="button" className="btn" onClick={() => setAsking('delete')}>
            Delete Appointment
          </button>
        </div>
      )}
    </Page>
  );
}
