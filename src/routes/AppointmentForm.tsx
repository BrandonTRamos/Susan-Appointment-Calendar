import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarLoading, CalendarTrouble } from '../components/CalendarTrouble';
import { Page } from '../components/Page';
import { useCalendar } from '../data/CalendarContext';
import {
  CalendarRefusal,
  DETAILS,
  type Appointment,
  type AppointmentChanges,
  type Detail,
} from '../lib/calendar';
import { timeZoneName } from '../lib/timeZone';
import { NotInCalendar } from './AppointmentDetail';

// The form for adding and changing an Appointment. Plain on purpose; ticket 06 gives it the chosen
// design. It checks nothing itself: the calendar core decides what makes an Appointment, and its
// refusal is shown in its own words.

/** What is typed in the form: every detail as words, empty when there is none. */
type Typed = Record<Detail, string>;

const typedFrom = (appointment?: Appointment): Typed =>
  Object.fromEntries(DETAILS.map((detail) => [detail, appointment?.[detail] ?? ''])) as Typed;

export function NewAppointment() {
  const { client } = useCalendar();
  return (
    <Page title="New Appointment">
      <Form
        start={typedFrom()}
        backTo="/"
        save={async (typed) => (await client.addAppointment(typed)).id}
      />
    </Page>
  );
}

export function EditAppointment() {
  const { id } = useParams();
  const { client, appointments, failed } = useCalendar();
  const appointment = appointments?.find((each) => each.id === id);

  return (
    <Page title="Change Appointment">
      {!appointment && <CalendarTrouble />}
      {!appointments && !failed && <CalendarLoading />}
      {appointments && !appointment && <NotInCalendar />}
      {appointment?.state === 'cancelled' && (
        <>
          <p>This Appointment is cancelled, so it cannot be changed.</p>
          <Link className="btn" to={`/appointments/${appointment.id}`}>
            Back to the Appointment
          </Link>
        </>
      )}
      {appointment?.state === 'active' && (
        // Keyed by the Appointment alone: what is being typed is kept when someone else changes it.
        <Form
          key={appointment.id}
          start={typedFrom(appointment)}
          backTo={`/appointments/${appointment.id}`}
          save={async (typed, start) => {
            // Only what this person changed is sent, so that it cannot undo someone else's change
            // to another detail made while the form was open.
            const changes: AppointmentChanges = {};
            for (const detail of DETAILS)
              if (typed[detail].trim() !== start[detail]) changes[detail] = typed[detail];
            if (Object.keys(changes).length > 0)
              await client.changeAppointment(appointment.id, changes);
            return appointment.id;
          }}
        />
      )}
    </Page>
  );
}

interface FormProps {
  /** What the form opens with. */
  start: Typed;
  /** Where "Back without saving" goes. */
  backTo: string;
  /** Saves what was typed and answers with the Appointment's ID. */
  save: (typed: Typed, start: Typed) => Promise<string>;
}

function Form({ start, backTo, save }: FormProps) {
  const { timeZone } = useCalendar();
  const navigate = useNavigate();
  // The details as they were when the form opened, whatever happens to the Appointment meanwhile.
  const [opened] = useState(start);
  const [typed, setTyped] = useState(start);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; detail?: Detail } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const id = await save(typed, opened);
      navigate(`/appointments/${id}`, { replace: true });
    } catch (error) {
      setProblem({
        message: error instanceof Error ? error.message : String(error),
        detail: error instanceof CalendarRefusal ? error.detail : undefined,
      });
      setBusy(false);
    }
  }

  /** What an input needs to show a detail and take what is typed. */
  const input = (detail: Detail) => ({
    name: detail,
    value: typed[detail],
    'aria-invalid': problem?.detail === detail || undefined,
    onChange: (event: { target: { value: string } }) =>
      setTyped((now) => ({ ...now, [detail]: event.target.value })),
  });
  const susansTime = `Susan's local time (${timeZoneName(timeZone)}), wherever you are.`;

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="What it is">
        {(ids) => <input {...ids} {...input('what')} type="text" autoComplete="off" required />}
      </Field>
      <div className="field-pair">
        <Field label="Date">
          {(ids) => <input {...ids} {...input('date')} type="date" required />}
        </Field>
        <Field label="Start time" hint={susansTime}>
          {(ids) => <input {...ids} {...input('time')} type="time" required />}
        </Field>
      </div>
      <Field label="Who it is with">
        {(ids) => <input {...ids} {...input('withWhom')} type="text" autoComplete="off" />}
      </Field>
      <Field label="Place">
        {(ids) => <input {...ids} {...input('placeName')} type="text" autoComplete="off" />}
      </Field>
      <Field label="Address">
        {(ids) => <input {...ids} {...input('placeAddress')} type="text" autoComplete="off" />}
      </Field>
      <div className="field-pair">
        <Field label="Driver">
          {(ids) => <input {...ids} {...input('driverName')} type="text" autoComplete="off" />}
        </Field>
        <Field label="Pickup time">
          {(ids) => <input {...ids} {...input('pickupTime')} type="time" />}
        </Field>
      </div>
      <Field label="Note for Susan" hint="Included in every Reminder.">
        {(ids) => <textarea {...ids} {...input('noteForSusan')} rows={3} />}
      </Field>
      <Field label="Private notes" hint="Never sent in a text.">
        {(ids) => <textarea {...ids} {...input('privateNotes')} rows={4} />}
      </Field>

      {problem && (
        <p className="error" role="alert">
          {problem.message}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Save
        </button>
        <Link className="btn" to={backTo}>
          Back without saving
        </Link>
      </div>
    </form>
  );
}

/** A labelled control, with a line beneath it saying what it is for when that needs saying. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (ids: { id: string; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': hint ? hintId : undefined })}
      {hint && (
        <p className="hint muted" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}
