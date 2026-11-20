import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarLoading, CalendarTrouble } from '../components/CalendarTrouble';
import { usePickedFrom } from '../components/Navigation';
import { Page } from '../components/Page';
import { useCalendar } from '../data/CalendarContext';
import {
  describeRepeat,
  overlappingAppointments,
  type Appointment,
  type Stamp,
} from '../lib/calendar';
import { formatDate, formatMoment, formatTime } from '../lib/localTime';
import { ReminderList } from './AppointmentReminders';
import { TextList } from './AppointmentTexts';

/**
 * One Appointment: all its details, a warning when it overlaps another, its Reminders and their
 * words, Edit, Cancel and Delete, and who added it and who last changed it. A full screen on a
 * phone; on a desktop, the detail panel. It shows the Appointment at its address, or the one it is
 * given.
 */
export function AppointmentDetail({ id: given }: { id?: string }) {
  const params = useParams();
  const id = given ?? params.id;
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

/**
 * Why an Appointment a Series made starts later than the Series' time: the clocks skipped that
 * time the night they went forward.
 */
export const shiftWords = (from: string, to: string, nextDay: boolean) =>
  `Moved from ${formatTime(from)} to ${formatTime(to)}${nextDay ? ' the next day' : ''}: the clocks go forward that night, so there is no ${formatTime(from)}.`;

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
  const { client, timeZone, appointments, texts } = useCalendar();
  const navigate = useNavigate();
  const back = usePickedFrom();
  const [asking, setAsking] = useState<'cancel' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { id, what, date, time, state, added, lastChanged } = appointment;
  const { withWhom, placeName, placeAddress, driverName, pickupTime } = appointment;
  const cancelled = state === 'cancelled';
  const overlaps = overlappingAppointments(appointment, appointments ?? []);

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
    <Page title={what} back={back}>
      <CalendarTrouble />
      {cancelled && (
        <p>
          <span className="badge">Cancelled</span>
        </p>
      )}
      {overlaps.length > 0 && (
        <div className="warning" role="note">
          {overlaps.map((other) => (
            <p key={other.id}>
              This overlaps <strong>{other.what}</strong>
              {`, ${formatDate(other.date, 'short')} at ${formatTime(other.time)}.`}
            </p>
          ))}
        </div>
      )}

      <dl className="details">
        <dt>When</dt>
        <dd>
          <span>{`${formatDate(date)} at ${formatTime(time)}`}</span>
          {appointment.series?.shiftedFrom && (
            <span className="muted">
              {shiftWords(appointment.series.shiftedFrom, time, appointment.series.date !== date)}
            </span>
          )}
        </dd>
        {appointment.series && (
          <>
            <dt>Repeats</dt>
            <dd>
              <span>{describeRepeat(appointment.series.repeat)}</span>
              {appointment.series.individuallyChanged && (
                <span className="muted">
                  Changed on its own, apart from the rest of the Series.
                </span>
              )}
            </dd>
          </>
        )}
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

      <ReminderList appointment={appointment} timeZone={timeZone} now={new Date()} texts={texts} />
      <TextList appointment={appointment} texts={texts} timeZone={timeZone} now={new Date()} />

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}

      {asking === 'cancel' && appointment.series && (
        <div className="card confirm" role="group" aria-label="Cancel which Appointments?">
          <p>
            <strong>Cancel only this one, or this and all later ones?</strong> This Appointment
            repeats. Whatever is cancelled stays in the calendar, marked cancelled.
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => carryOut(() => client.cancelAppointment(id))}
            >
              Cancel only this one
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => carryOut(() => client.endSeries(id))}
            >
              Cancel this and all later ones
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setAsking(null)}>
              No, keep them
            </button>
          </div>
        </div>
      )}
      {asking === 'cancel' && !appointment.series && (
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
                    navigate(back.to, { replace: true });
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

      <div className="stamps muted">
        <p>{stamp('Added', added)}</p>
        {lastChanged && <p>{stamp(cancelled ? 'Cancelled' : 'Last changed', lastChanged)}</p>}
      </div>
    </Page>
  );
}
