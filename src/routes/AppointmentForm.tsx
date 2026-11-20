import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarLoading, CalendarTrouble } from '../components/CalendarTrouble';
import { Field } from '../components/Field';
import { usePickedFrom } from '../components/Navigation';
import { Page } from '../components/Page';
import { useCalendar } from '../data/CalendarContext';
import {
  CalendarRefusal,
  DETAILS,
  type Appointment,
  type AppointmentChanges,
  type RefusalField,
  type ReminderSetting,
  type Series,
  type SeriesChanges,
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
import {
  endsSetting,
  NO_REPEAT,
  RepeatFields,
  repeatSetting,
  typedRepeat,
  type TypedRepeat,
} from './AppointmentRepeat';

// The form for adding and changing an Appointment: a full screen on a phone, the detail panel on a
// desktop. It checks nothing itself: the calendar core decides what makes an Appointment, and its
// refusal is shown in its own words. It does warn, before saving, about Reminders that will not do
// what the person may expect (AppointmentReminders.tsx). A new Appointment can be made to repeat
// (AppointmentRepeat.tsx), which adds a Series; saving a change to one in a Series asks whether it
// is for only this one or for this and all later ones.

/**
 * What is typed in the form: every detail as words, empty when there is none, the Reminders, and
 * how it repeats.
 */
interface Typed {
  details: Record<(typeof DETAILS)[number], string>;
  reminders: TypedReminder[];
  repeat: TypedRepeat;
}

/** Which Appointments in a Series a change is for. */
type Scope = 'one' | 'later';

/**
 * A saved Appointment as the form opens it, with its Series when it is in one, or a new one with
 * the Reminder it starts with.
 */
const typedFrom = (appointment?: Appointment, series?: Series | null): Typed => ({
  details: Object.fromEntries(
    DETAILS.map((detail) => [detail, appointment?.[detail] ?? '']),
  ) as Typed['details'],
  reminders: appointment ? appointment.reminders.map(typedReminder) : [typedReminder()],
  repeat: series ? typedRepeat(series) : NO_REPEAT,
});

/** Whether a change to how it repeats or when it ends was typed. */
const repeatChanged = (typed: Typed, start: Typed) =>
  JSON.stringify([repeatSetting(typed.repeat), endsSetting(typed.repeat)]) !==
  JSON.stringify([repeatSetting(start.repeat), endsSetting(start.repeat)]);

const settings = (reminders: TypedReminder[]): ReminderSetting[] => reminders.map(reminderSetting);

export function NewAppointment() {
  const { client } = useCalendar();
  // The new Appointment's ID, chosen once for this form: if a save has to be sent again, because
  // its answer was lost or the person pressed Save twice, the core adds one Appointment, not two.
  // A Series gets its own, the same way.
  const [id] = useState(() => crypto.randomUUID());
  const [seriesId] = useState(() => crypto.randomUUID());
  const back = usePickedFrom();
  return (
    <Page title="New Appointment">
      <Form
        start={typedFrom()}
        backTo={back.to}
        canStopRepeating
        save={async ({ details, reminders, repeat }) => {
          const setting = repeatSetting(repeat);
          if (!setting)
            return (await client.addAppointment({ ...details, reminders: settings(reminders) }, id))
              .id;
          const series = {
            ...details,
            reminders: settings(reminders),
            repeat: setting,
            ends: endsSetting(repeat),
          };
          return (await client.addSeries(series, seriesId)).id;
        }}
      />
    </Page>
  );
}

/**
 * The Series an Appointment belongs to, read once: undefined while it is being read, null for one
 * not in a Series, or when its Series could not be read, which leaves it to be changed on its own.
 */
function useSeriesOf(appointment: Appointment | undefined): Series | null | undefined {
  const { client } = useCalendar();
  const seriesId = appointment?.series?.id;
  const [read, setRead] = useState<{ id: string; series: Series | null } | null>(null);
  useEffect(() => {
    if (!seriesId) return;
    let current = true;
    client.series(seriesId).then(
      (series) => current && setRead({ id: seriesId, series }),
      () => current && setRead({ id: seriesId, series: null }),
    );
    return () => {
      current = false;
    };
  }, [client, seriesId]);
  if (!seriesId) return null;
  return read?.id === seriesId ? read.series : undefined;
}

export function EditAppointment() {
  const { id } = useParams();
  const { client, appointments, failed } = useCalendar();
  const appointment = appointments?.find((each) => each.id === id);
  const series = useSeriesOf(appointment);

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
      {appointment?.state === 'active' && series === undefined && <CalendarLoading />}
      {appointment?.state === 'active' && series !== undefined && (
        // Keyed by the Appointment alone: what is being typed is kept when someone else changes it.
        <Form
          key={appointment.id}
          start={typedFrom(appointment, series)}
          backTo={`/appointments/${appointment.id}`}
          inSeries={series !== null}
          save={async (typed, start, scope) => {
            // Only what this person changed is sent, so that it cannot undo someone else's change
            // to another detail made while the form was open. For this and all later ones, what is
            // not sent stays as the Series has it.
            const changes: SeriesChanges = {};
            for (const detail of DETAILS)
              if (typed.details[detail].trim() !== start.details[detail])
                changes[detail] = typed.details[detail];
            const reminders = settings(typed.reminders);
            if (JSON.stringify(reminders) !== JSON.stringify(settings(start.reminders)))
              changes.reminders = reminders;
            if (scope === 'later') {
              if (repeatChanged(typed, start)) {
                changes.repeat = repeatSetting(typed.repeat) ?? undefined;
                changes.ends = endsSetting(typed.repeat);
              }
              return (await client.changeSeries(appointment.id, changes)).id;
            }
            if (Object.keys(changes).length > 0)
              await client.changeAppointment(appointment.id, changes as AppointmentChanges);
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
  /** For a new Appointment: whether it repeats can be chosen, and starts as not. */
  canStopRepeating?: boolean;
  /** For an Appointment in a Series: saving asks whether the change is for later ones too. */
  inSeries?: boolean;
  /** Saves what was typed, for which Appointments in a Series, and answers with the Appointment's ID. */
  save: (typed: Typed, start: Typed, scope?: Scope) => Promise<string>;
}

function Form({ start, backTo, canStopRepeating = false, inSeries = false, save }: FormProps) {
  const { timeZone } = useCalendar();
  const navigate = useNavigate();
  // The details as they were when the form opened, whatever happens to the Appointment meanwhile.
  const [opened] = useState(start);
  const [typed, setTyped] = useState(start);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; detail?: RefusalField } | null>(null);
  /** Asking whether to save an Appointment that will send Susan no Reminder. */
  const [asking, setAsking] = useState(false);
  /** Asking which Appointments in the Series the change is for; then, which was picked. */
  const [choosing, setChoosing] = useState(false);
  const [scope, setScope] = useState<Scope | undefined>(undefined);
  const now = new Date();
  const repeats = typed.repeat.every !== 'none';
  const unchanged = JSON.stringify(typed) === JSON.stringify(opened);

  async function submit(event?: FormEvent, noReminderConfirmed = false, chosen = scope) {
    event?.preventDefault();
    if (inSeries && !chosen && !unchanged) {
      setChoosing(true);
      return;
    }
    setChoosing(false);
    setScope(chosen);
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
      const id = await save(typed, opened, chosen);
      navigate(`/appointments/${id}`, { replace: true });
    } catch (error) {
      setProblem({
        message: error instanceof Error ? error.message : String(error),
        detail: error instanceof CalendarRefusal ? error.detail : undefined,
      });
      setScope(undefined);
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

      {(canStopRepeating || inSeries) && (
        <RepeatFields
          typed={typed.repeat}
          date={typed.details.date}
          canStop={canStopRepeating}
          onChange={(repeat) => {
            setTyped((was) => ({ ...was, repeat }));
            setChoosing(false);
          }}
        />
      )}

      <ReminderFields
        details={typed.details}
        reminders={typed.reminders}
        onChange={(reminders) => {
          setTyped((was) => ({ ...was, reminders }));
          setAsking(false);
          setChoosing(false);
        }}
        timeZone={timeZone}
        now={now}
        // A new Series' Reminders follow each Appointment in it; one Appointment in a Series can
        // still have an exact-time one.
        exactTime={!(canStopRepeating && repeats)}
      />

      {problem && (
        <p className="error" role="alert">
          {problem.message}
        </p>
      )}
      {choosing && (
        <div className="card confirm" role="group" aria-label="Change which Appointments?">
          {repeatChanged(typed, opened) ? (
            <p>
              <strong>Change this and all later ones?</strong> A change to how it repeats or when it
              ends is for this Appointment and all later ones in the Series.
            </p>
          ) : (
            <p>
              <strong>Change only this one, or this and all later ones?</strong> This Appointment
              repeats.
            </p>
          )}
          <div className="actions">
            {!repeatChanged(typed, opened) && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => submit(undefined, false, 'one')}
              >
                Only this one
              </button>
            )}
            <button
              type="button"
              className={repeatChanged(typed, opened) ? 'btn btn-primary' : 'btn'}
              disabled={busy}
              onClick={() => submit(undefined, false, 'later')}
            >
              This and all later ones
            </button>
            <button type="button" className="btn" onClick={() => setChoosing(false)}>
              Go back
            </button>
          </div>
        </div>
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
              onClick={() => submit(undefined, true, scope)}
            >
              Save with no Reminder
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setAsking(false);
                setScope(undefined);
              }}
            >
              Go back
            </button>
          </div>
        </div>
      )}
      {!asking && !choosing && (
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
