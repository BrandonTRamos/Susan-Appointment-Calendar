import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarLoading, CalendarTrouble } from '../components/CalendarTrouble';
import { Field } from '../components/Field';
import { Page } from '../components/Page';
import { useCalendar } from '../data/CalendarContext';
import {
  CalendarRefusal,
  DETAILS,
  type Appointment,
  type AppointmentChanges,
  type RefusalField,
  type ReminderSetting,
} from '../lib/calendar';
import { timeZoneName } from '../lib/timeZone';
import { NotInCalendar } from './AppointmentDetail';
import {
  noReminderToSend,
  ReminderFields,
  reminderSetting,
  typedReminder,
  type TypedReminder,
} from './AppointmentReminders';

// The form for adding and changing an Appointment: a full screen on a phone, the detail panel on a
// desktop. It checks nothing itself: the calendar core decides what makes an Appointment, and its
// refusal is shown in its own words. It does warn, before saving, about Reminders that will not do
// what the person may expect (AppointmentReminders.tsx).

/** What is typed in the form: every detail as words, empty when there is none, and the Reminders. */
interface Typed {
  details: Record<(typeof DETAILS)[number], string>;
  reminders: TypedReminder[];
}

/** A saved Appointment as the form opens it, or a new one with the Reminder it starts with. */
const typedFrom = (appointment?: Appointment): Typed => ({
  details: Object.fromEntries(
    DETAILS.map((detail) => [detail, appointment?.[detail] ?? '']),
  ) as Typed['details'],
  reminders: appointment ? appointment.reminders.map(typedReminder) : [typedReminder()],
});

const settings = (reminders: TypedReminder[]): ReminderSetting[] => reminders.map(reminderSetting);

export function NewAppointment() {
  const { client } = useCalendar();
  // The new Appointment's ID, chosen once for this form: if a save has to be sent again, because
  // its answer was lost or the person pressed Save twice, the core adds one Appointment, not two.
  const [id] = useState(() => crypto.randomUUID());
  return (
    <Page title="New Appointment">
      <Form
        start={typedFrom()}
        backTo="/"
        save={async ({ details, reminders }) =>
          (await client.addAppointment({ ...details, reminders: settings(reminders) }, id)).id
        }
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
              if (typed.details[detail].trim() !== start.details[detail])
                changes[detail] = typed.details[detail];
            const reminders = settings(typed.reminders);
            if (JSON.stringify(reminders) !== JSON.stringify(settings(start.reminders)))
              changes.reminders = reminders;
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
  const [problem, setProblem] = useState<{ message: string; detail?: RefusalField } | null>(null);
  /** Asking whether to save an Appointment that will send Susan no Reminder. */
  const [asking, setAsking] = useState(false);
  const now = new Date();

  async function submit(event?: FormEvent, noReminderConfirmed = false) {
    event?.preventDefault();
    if (
      !noReminderConfirmed &&
      noReminderToSend(typed.details, typed.reminders, timeZone, new Date())
    ) {
      setAsking(true);
      return;
    }
    setAsking(false);
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
  const input = (detail: (typeof DETAILS)[number]) => ({
    name: detail,
    value: typed.details[detail],
    'aria-invalid': problem?.detail === detail || undefined,
    onChange: (event: { target: { value: string } }) =>
      setTyped((was) => ({ ...was, details: { ...was.details, [detail]: event.target.value } })),
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

      <ReminderFields
        details={typed.details}
        reminders={typed.reminders}
        onChange={(reminders) => {
          setTyped((was) => ({ ...was, reminders }));
          setAsking(false);
        }}
        timeZone={timeZone}
        now={now}
      />

      {problem && (
        <p className="error" role="alert">
          {problem.message}
        </p>
      )}
      {asking && (
        <div className="card confirm" role="group" aria-label="Save with no Reminder?">
          <p>
            <strong>No Reminder will be sent for this Appointment.</strong> Susan will not be texted
            about it. Save it anyway?
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => submit(undefined, true)}
            >
              Save with no Reminder
            </button>
            <button type="button" className="btn" onClick={() => setAsking(false)}>
              Go back
            </button>
          </div>
        </div>
      )}
      {!asking && (
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Save
          </button>
          <Link className="btn" to={backTo}>
            Back without saving
          </Link>
        </div>
      )}
    </form>
  );
}
