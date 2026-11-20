import { useId } from 'react';
import { Field } from '../components/Field';
import { useInPanel } from '../components/Page';
import {
  describeReminder,
  isOvernight,
  REMINDER_UNITS,
  reminderDue,
  reminderWords,
  STARTING_REMINDER,
  type Appointment,
  type AppointmentDetails,
  type Reminder,
  type ReminderSetting,
  type ReminderShape,
  type ReminderTiming,
  type ReminderUnit,
} from '../lib/calendar';
import { formatMoment, isDate, isTime, momentOf } from '../lib/localTime';

// An Appointment's Reminders: the part of the form that sets them, and the part of the detail that
// shows them. Kept apart from the form and the detail so that each can change without the other.
// What a Reminder does is worked out by the calendar core's own functions, so what is shown here is
// what the core will do.

/** A Reminder as it is typed: every shape's fields, so that switching shape loses nothing. */
export interface TypedReminder {
  /** Tells the Reminders apart on screen. */
  key: string;
  /** The saved Reminder this is, if it is one. */
  id?: string;
  shape: ReminderShape;
  amount: string;
  unit: ReminderUnit;
  days: string;
  dayTime: string;
  date: string;
  time: string;
  /** Flagged for review when the form opened. */
  needsReview: boolean;
  /** Confirmed in this form. */
  reviewed: boolean;
}

const BLANK: Omit<TypedReminder, 'key' | 'shape'> = {
  amount: '2',
  unit: 'hours',
  days: '1',
  dayTime: '18:00',
  date: '',
  time: '',
  needsReview: false,
  reviewed: false,
};

/** A Reminder for the form: a saved one, or the one a new Appointment starts with. */
export function typedReminder(reminder: Reminder | ReminderTiming = STARTING_REMINDER) {
  const typed: TypedReminder = { key: crypto.randomUUID(), shape: reminder.shape, ...BLANK };
  if ('id' in reminder)
    Object.assign(typed, { id: reminder.id, needsReview: reminder.needsReview });
  if (reminder.shape === 'before')
    Object.assign(typed, { amount: String(reminder.amount), unit: reminder.unit });
  if (reminder.shape === 'daysBefore')
    Object.assign(typed, { days: String(reminder.days), dayTime: reminder.time });
  if (reminder.shape === 'at') Object.assign(typed, { date: reminder.date, time: reminder.time });
  return typed;
}

/** A number as typed. Anything that is not one is left for the core to refuse. */
const number = (typed: string) => (typed.trim() === '' ? NaN : Number(typed));

function timingOf(typed: TypedReminder): ReminderTiming {
  switch (typed.shape) {
    case 'before':
      return { shape: 'before', amount: number(typed.amount), unit: typed.unit };
    case 'daysBefore':
      return { shape: 'daysBefore', days: number(typed.days), time: typed.dayTime };
    case 'at':
      return { shape: 'at', date: typed.date, time: typed.time };
  }
}

/** The Reminder as the core's commands take it. */
export function reminderSetting(typed: TypedReminder): ReminderSetting {
  return {
    ...timingOf(typed),
    ...(typed.id && { id: typed.id }),
    ...(typed.reviewed && { reviewed: true }),
  };
}

/** The details the form holds, as words. */
type TypedDetails = Record<keyof AppointmentDetails, string>;

/** The moment the typed Appointment starts, or null while its date or time is not one. */
function startOf({ date, time }: TypedDetails, timeZone: string): Date | null {
  return isDate(date) && isTime(time) ? momentOf(date, time, timeZone) : null;
}

/**
 * Whether saving the typed Appointment would leave it with no Reminder still to be sent: it starts
 * in the future, and none of its Reminders goes out between now and then.
 */
export function noReminderToSend(
  details: TypedDetails,
  reminders: TypedReminder[],
  timeZone: string,
  now: Date,
): boolean {
  const start = startOf(details, timeZone);
  if (!start || start <= now) return false;
  return !reminders.some((typed) => {
    const due = reminderDue(timingOf(typed), details, timeZone);
    return due && due > now && due < start;
  });
}

/** The words a Reminder sends, worked out from what is typed, with nothing typed as nothing. */
function wordsFor(details: TypedDetails | Appointment, due: Date, timeZone: string) {
  const blankless = Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, value || null]),
  ) as unknown as AppointmentDetails;
  return reminderWords(blankless, { dueAt: due }, timeZone);
}

/** The Reminders section of the Appointment form. */
export function ReminderFields({
  details,
  reminders,
  onChange,
  timeZone,
  now,
  exactTime = true,
}: {
  details: TypedDetails;
  reminders: TypedReminder[];
  onChange: (reminders: TypedReminder[]) => void;
  timeZone: string;
  now: Date;
  /** Whether a Reminder can be at an exact time: not on a Series, whose Reminders follow each one. */
  exactTime?: boolean;
}) {
  const headingId = useId();
  const change = (key: string, changes: Partial<TypedReminder>) =>
    onChange(reminders.map((each) => (each.key === key ? { ...each, ...changes } : each)));
  const start = startOf(details, timeZone);

  return (
    <section className="form-reminders" aria-labelledby={headingId}>
      <Heading id={headingId}>Reminders</Heading>
      <p className="hint muted">
        {exactTime
          ? 'Texts to Susan about this Appointment, at her local time.'
          : 'Texts to Susan about each Appointment in the Series, at her local time. They go out a set time before each one.'}
      </p>
      {reminders.length === 0 && (
        <p>No Reminders. Susan will not be texted about this Appointment.</p>
      )}
      {reminders.map((typed, n) => {
        const due = reminderDue(timingOf(typed), details, timeZone);
        const flagged = typed.needsReview && !typed.reviewed;
        return (
          <fieldset key={typed.key} className="card reminder">
            <legend>{`Reminder ${n + 1}`}</legend>
            <Field label="When it goes out">
              {(ids) => (
                <select
                  {...ids}
                  value={typed.shape}
                  onChange={(event) =>
                    change(typed.key, { shape: event.target.value as ReminderShape })
                  }
                >
                  <option value="before">Some time before the start</option>
                  <option value="daysBefore">Days before, at a set time</option>
                  {(exactTime || typed.shape === 'at') && (
                    <option value="at">At an exact date and time</option>
                  )}
                </select>
              )}
            </Field>
            {typed.shape === 'before' && (
              <div className="field-pair">
                <Field label="How long before">
                  {(ids) => (
                    <input
                      {...ids}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={typed.amount}
                      onChange={(event) => change(typed.key, { amount: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Minutes, hours or days">
                  {(ids) => (
                    <select
                      {...ids}
                      value={typed.unit}
                      onChange={(event) =>
                        change(typed.key, { unit: event.target.value as ReminderUnit })
                      }
                    >
                      {REMINDER_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit[0].toUpperCase() + unit.slice(1)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
            )}
            {typed.shape === 'daysBefore' && (
              <div className="field-pair">
                <Field label="Days before" hint="0 is the same day.">
                  {(ids) => (
                    <input
                      {...ids}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={typed.days}
                      onChange={(event) => change(typed.key, { days: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Reminder time">
                  {(ids) => (
                    <input
                      {...ids}
                      type="time"
                      value={typed.dayTime}
                      onChange={(event) => change(typed.key, { dayTime: event.target.value })}
                    />
                  )}
                </Field>
              </div>
            )}
            {typed.shape === 'at' && (
              <div className="field-pair">
                <Field label="Reminder date">
                  {(ids) => (
                    <input
                      {...ids}
                      type="date"
                      value={typed.date}
                      onChange={(event) =>
                        change(typed.key, { date: event.target.value, needsReview: false })
                      }
                    />
                  )}
                </Field>
                <Field label="Reminder time">
                  {(ids) => (
                    <input
                      {...ids}
                      type="time"
                      value={typed.time}
                      onChange={(event) =>
                        change(typed.key, { time: event.target.value, needsReview: false })
                      }
                    />
                  )}
                </Field>
              </div>
            )}

            {due && <p className="reminder-due">{`Goes out ${formatMoment(due, timeZone)}`}</p>}
            {flagged && (
              <div className="warning" role="group" aria-label="Check this Reminder">
                <p>
                  The Appointment has moved since this Reminder was set, and it kept its time. Check
                  that it still makes sense.
                </p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => change(typed.key, { reviewed: true })}
                >
                  Keep this time
                </button>
              </div>
            )}
            <Warnings due={due} start={start} now={now} timeZone={timeZone} flagged={flagged} />
            {due && <Preview words={wordsFor(details, due, timeZone)} />}
            <div className="actions">
              <button
                type="button"
                className="btn"
                onClick={() => onChange(reminders.filter((each) => each.key !== typed.key))}
              >
                Remove this Reminder
              </button>
            </div>
          </fieldset>
        );
      })}
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => onChange([...reminders, typedReminder()])}
        >
          Add a Reminder
        </button>
      </div>
    </section>
  );
}

/** The Reminders heading: one level below the screen's, which is lower in the detail panel. */
function Heading({ id, children }: { id: string; children: string }) {
  return useInPanel() ? <h3 id={id}>{children}</h3> : <h2 id={id}>{children}</h2>;
}

/** What a person should know about when a Reminder goes out. */
function Warnings({
  due,
  start,
  now,
  timeZone,
  flagged,
}: {
  due: Date | null;
  start: Date | null;
  now: Date;
  timeZone: string;
  flagged: boolean;
}) {
  if (!due) return null;
  const warnings: string[] = [];
  if (due <= now) warnings.push('This time has already passed.');
  else if (start && due >= start && !flagged)
    warnings.push('This is after the Appointment starts.');
  if (isOvernight(due, timeZone))
    warnings.push('This goes out overnight, between 9:00 pm and 7:00 am.');
  return (
    <>
      {warnings.map((warning) => (
        <p key={warning} className="warning">
          {warning}
        </p>
      ))}
    </>
  );
}

/** The exact words Susan will read. */
function Preview({ words }: { words: string }) {
  return (
    <div className="text-preview">
      <p className="muted">What Susan will read</p>
      <p className="quoted">{words}</p>
    </div>
  );
}

/** The Reminders on an opened Appointment: when each goes out, and its exact words. */
export function ReminderList({
  appointment,
  timeZone,
  now,
}: {
  appointment: Appointment;
  timeZone: string;
  now: Date;
}) {
  const { reminders, state } = appointment;
  const headingId = useId();
  return (
    <section className="reminders" aria-labelledby={headingId}>
      <Heading id={headingId}>Reminders</Heading>
      {state === 'cancelled' && (
        <p className="muted">No Reminders are sent for a cancelled Appointment.</p>
      )}
      {reminders.length === 0 && (
        <p>No Reminders. Susan will not be texted about this Appointment.</p>
      )}
      {reminders.length > 0 && (
        <ul aria-label="Reminders">
          {reminders.map((reminder) => {
            const due = new Date(reminder.dueAt);
            return (
              <li key={reminder.id} className="reminder">
                <p>
                  <strong>{describeReminder(reminder)}</strong>
                </p>
                <p>{`Goes out ${formatMoment(due, timeZone)}`}</p>
                {reminder.needsReview && (
                  <p className="warning">
                    The Appointment has moved since this Reminder was set, and it kept its time.
                    Edit the Appointment to keep it or change it.
                  </p>
                )}
                {due <= now && <p className="muted">This time has passed.</p>}
                {due > now && isOvernight(due, timeZone) && (
                  <p className="warning">This goes out overnight, between 9:00 pm and 7:00 am.</p>
                )}
                <Preview words={wordsFor(appointment, due, timeZone)} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
