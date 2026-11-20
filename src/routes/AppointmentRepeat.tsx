import { useId } from 'react';
import { Field } from '../components/Field';
import { useInPanel } from '../components/Page';
import {
  describeRepeat,
  MOST_MONTHS,
  MOST_WEEKS,
  repeatDates,
  WEEKDAY_NAMES,
  weekdayOf,
  type Repeat,
  type RepeatSetting,
  type Series,
} from '../lib/calendar';
import { addDays, dateParts, isDate } from '../lib/localTime';

// The part of the Appointment form that makes an Appointment repeat: every N weeks on chosen
// weekdays, or every N months, ending on a date or never. It shows the dates the pattern gives, as
// the calendar core will work them out, and leaves every check to the core.

/** How an Appointment repeats, as it is typed. */
export interface TypedRepeat {
  every: 'none' | 'week' | 'month';
  interval: string;
  /** 0 is Monday. */
  weekdays: number[];
  ends: 'never' | 'on';
  endsOn: string;
}

export const NO_REPEAT: TypedRepeat = {
  every: 'none',
  interval: '1',
  weekdays: [],
  ends: 'never',
  endsOn: '',
};

/** A Series as the form opens it, for changing it from one of its Appointments on. */
export function typedRepeat(series: Series): TypedRepeat {
  const { repeat, ends } = series;
  return {
    every: repeat.every,
    interval: String(repeat.interval),
    weekdays: repeat.every === 'week' ? [...repeat.weekdays] : [],
    ends: ends ? 'on' : 'never',
    endsOn: ends ?? '',
  };
}

/** A number as typed. Anything that is not one is left for the core to refuse. */
const number = (typed: string) => (typed.trim() === '' ? NaN : Number(typed));

/** The pattern as the core's commands take it, or null for an Appointment that does not repeat. */
export function repeatSetting(typed: TypedRepeat): RepeatSetting | null {
  if (typed.every === 'week')
    return { every: 'week', interval: number(typed.interval), weekdays: [...typed.weekdays] };
  if (typed.every === 'month') return { every: 'month', interval: number(typed.interval) };
  return null;
}

/** When it ends, as the core's commands take it: a date, or null for no end. */
export const endsSetting = (typed: TypedRepeat): string | null =>
  typed.ends === 'on' ? typed.endsOn : null;

/** The pattern that what is typed makes, from `date`, or null while it does not make one. */
function patternOf(typed: TypedRepeat, date: string): Repeat | null {
  const interval = number(typed.interval);
  if (!isDate(date) || !Number.isInteger(interval) || interval < 1) return null;
  if (typed.every === 'week' && typed.weekdays.length > 0)
    return { every: 'week', interval, weekdays: [...typed.weekdays].sort((a, b) => a - b) };
  if (typed.every === 'month') return { every: 'month', interval, day: Number(date.slice(8, 10)) };
  return null;
}

/** How many of its first dates are shown. */
const SHOWN = 4;

export function RepeatFields({
  typed,
  date,
  onChange,
  canStop,
}: {
  typed: TypedRepeat;
  /** The date typed for the Appointment: the first of the Series. */
  date: string;
  onChange: (typed: TypedRepeat) => void;
  /** Whether "Does not repeat" can be picked: not for an Appointment already in a Series. */
  canStop: boolean;
}) {
  const headingId = useId();
  const change = (changes: Partial<TypedRepeat>) => onChange({ ...typed, ...changes });
  const pattern = patternOf(typed, date);
  const ends = typed.ends === 'on' && isDate(typed.endsOn) ? typed.endsOn : null;
  const first = pattern ? repeatDates(pattern, date, ends, addDays(date, 366)).slice(0, SHOWN) : [];
  const unit = typed.every === 'week' ? 'weeks' : 'months';

  return (
    <section className="form-repeat" aria-labelledby={headingId}>
      <Heading id={headingId}>Repeats</Heading>
      <Field label="How it repeats">
        {(ids) => (
          <select
            {...ids}
            value={typed.every}
            onChange={(event) => {
              const every = event.target.value as TypedRepeat['every'];
              // Weekly starts on the day the Appointment is on.
              const weekdays =
                every === 'week' && typed.weekdays.length === 0 && isDate(date)
                  ? [weekdayOf(date)]
                  : typed.weekdays;
              change({ every, weekdays });
            }}
          >
            {canStop && <option value="none">Does not repeat</option>}
            <option value="week">Every week, or every few weeks</option>
            <option value="month">Every month, or every few months</option>
          </select>
        )}
      </Field>

      {typed.every !== 'none' && (
        <>
          <Field
            label={`How many ${unit} apart`}
            hint={typed.every === 'week' ? '1 is every week.' : '1 is every month.'}
          >
            {(ids) => (
              <input
                {...ids}
                type="number"
                inputMode="numeric"
                min={1}
                max={typed.every === 'week' ? MOST_WEEKS : MOST_MONTHS}
                value={typed.interval}
                onChange={(event) => change({ interval: event.target.value })}
              />
            )}
          </Field>
          {typed.every === 'week' && (
            <fieldset className="weekdays">
              <legend>On these days</legend>
              {WEEKDAY_NAMES.map((name, weekday) => (
                <label key={name} className="weekday">
                  <input
                    type="checkbox"
                    checked={typed.weekdays.includes(weekday)}
                    onChange={(event) =>
                      change({
                        weekdays: event.target.checked
                          ? [...typed.weekdays, weekday].sort((a, b) => a - b)
                          : typed.weekdays.filter((each) => each !== weekday),
                      })
                    }
                  />
                  {name}
                </label>
              ))}
            </fieldset>
          )}
          <Field label="Ends">
            {(ids) => (
              <select
                {...ids}
                value={typed.ends}
                onChange={(event) => change({ ends: event.target.value as TypedRepeat['ends'] })}
              >
                <option value="never">Never</option>
                <option value="on">On a date</option>
              </select>
            )}
          </Field>
          {typed.ends === 'on' && (
            <Field label="Last date" hint="No Appointment in the Series is after it.">
              {(ids) => (
                <input
                  {...ids}
                  type="date"
                  value={typed.endsOn}
                  onChange={(event) => change({ endsOn: event.target.value })}
                />
              )}
            </Field>
          )}
          {pattern && (
            <div className="repeat-preview">
              <p>
                <strong>{describeRepeat(pattern)}</strong>
              </p>
              {first.length > 0 && (
                <p className="muted">
                  {`Starting ${first
                    .map((each) => {
                      const { weekday, month, day } = dateParts(each);
                      return `${weekday}, ${month} ${day}`;
                    })
                    .join(' · ')}`}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** The section's heading: one level below the screen's, which is lower in the detail panel. */
function Heading({ id, children }: { id: string; children: string }) {
  return useInPanel() ? <h3 id={id}>{children}</h3> : <h2 id={id}>{children}</h2>;
}
