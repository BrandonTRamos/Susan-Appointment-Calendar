import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Link, useMatch } from 'react-router-dom';
import { CalendarLoading, CalendarTrouble } from '../components/CalendarTrouble';
import { BackIcon, ForwardIcon, PlusIcon } from '../components/Icons';
import { Page } from '../components/Page';
import { ReminderCount } from '../components/RemindersToSend';
import { useCalendar } from '../data/CalendarContext';
import type { Appointment } from '../lib/calendar';
import { addDays, dateParts, formatDate, formatTime } from '../lib/localTime';
import { addMonths, formatMonth, monthOf, monthWeeks } from '../lib/monthGrid';
import { useDesktopWidth } from '../lib/useDesktopWidth';
import { useToday } from '../lib/useToday';
import { driverSentence, joined } from './Upcoming';

/** The month on show and the picked day; null for either means today's. */
interface View {
  month: string | null;
  day: string | null;
}

const MonthView = createContext<[View, Dispatch<SetStateAction<View>>] | null>(null);

/**
 * Keeps the month on show and the picked day while the Month tab is closed, so that coming back
 * from an Appointment opened from it finds the Month as it was left. A reload starts at today.
 */
export function MonthPlace({ children }: { children: ReactNode }) {
  const view = useState<View>({ month: null, day: null });
  return <MonthView.Provider value={view}>{children}</MonthView.Provider>;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** On a desktop, how many Appointments a day's cell shows before saying how many more there are. */
const CELL_LIMIT = 2;

/**
 * A month at a glance, to find a free day or jump to a date. Cancelled Appointments are shown,
 * marked as cancelled, so that nobody takes one for a booking still to be kept. Days of the months
 * either side fill out the first and last weeks.
 *
 * On a phone, each day with an Appointment has a mark, and the picked day's Appointments are listed
 * beneath the grid, then the ones after it. On a desktop each Appointment is in its day's cell, by
 * time and name, and opens in the detail panel.
 */
export function Month() {
  const { appointments, failed, timeZone } = useCalendar();
  const today = useToday(timeZone);
  const desktop = useDesktopWidth();
  const [view, setView] = useContext(MonthView)!;

  const month = view.month ?? monthOf(today);
  // Moving to a month picks today when it is in that month, and the month's first day otherwise.
  const picked = view.day ?? (month === monthOf(today) ? today : `${month}-01`);
  const show = (to: string) => setView({ month: to, day: null });

  const onDay = new Map<string, Appointment[]>();
  for (const appointment of appointments ?? [])
    onDay.set(appointment.date, [...(onDay.get(appointment.date) ?? []), appointment]);

  const controls = (
    <div className="month-controls">
      <button type="button" className="btn" onClick={() => setView({ month: null, day: null })}>
        Today
      </button>
      <button
        type="button"
        className="btn btn-icon"
        aria-label="Previous month"
        onClick={() => show(addMonths(month, -1))}
      >
        <BackIcon size={22} />
      </button>
      <button
        type="button"
        className="btn btn-icon"
        aria-label="Next month"
        onClick={() => show(addMonths(month, 1))}
      >
        <ForwardIcon size={22} />
      </button>
    </div>
  );

  return (
    <Page
      title={formatMonth(month)}
      action={
        desktop ? (
          controls
        ) : (
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
      {!desktop && controls}
      <CalendarTrouble />
      {!appointments && !failed && <CalendarLoading />}
      {appointments &&
        (desktop ? (
          <DesktopGrid month={month} today={today} onDay={onDay} />
        ) : (
          <>
            <PhoneGrid
              month={month}
              today={today}
              picked={picked}
              onDay={onDay}
              pick={(day) => setView({ month: monthOf(day), day })}
            />
            <DayList picked={picked} today={today} appointments={appointments} />
          </>
        ))}
    </Page>
  );
}

interface GridProps {
  month: string;
  today: string;
  /** The Appointments on each day, cancelled ones included, in date order. */
  onDay: Map<string, Appointment[]>;
}

/** The grid's table, its heading row of weekdays, and a row for each week. */
function Grid({
  month,
  long,
  day,
}: {
  month: string;
  long: boolean;
  day: (date: string) => ReactNode;
}) {
  return (
    <table className="month-grid" aria-label={formatMonth(month)}>
      <thead>
        <tr>
          {WEEKDAYS.map((weekday) => (
            <th key={weekday} scope="col">
              <abbr title={weekday}>{long ? weekday.slice(0, 3) : weekday[0]}</abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {monthWeeks(month).map((week) => (
          <tr key={week[0]}>{week.map(day)}</tr>
        ))}
      </tbody>
    </table>
  );
}

const isCancelled = (appointment: Appointment) => appointment.state === 'cancelled';

/** What a phone's day button says it holds: "2 Appointments, 1 cancelled", or nothing. */
function dayCounts(count: number, cancelled: number): string[] {
  const appointments = (n: number, kind = '') => `${n} ${kind}Appointment${n > 1 ? 's' : ''}`;
  if (count === 0) return cancelled > 0 ? [appointments(cancelled, 'cancelled ')] : [];
  return cancelled > 0 ? [appointments(count), `${cancelled} cancelled`] : [appointments(count)];
}

const dayOfMonth = (date: string) => Number(date.slice(8));
const cellClass = (date: string, month: string) =>
  monthOf(date) === month ? undefined : 'other-month';

/**
 * On a phone: a button for each day, with a mark when it has an Appointment: filled when one is
 * still on, hollow when every one there was cancelled.
 */
function PhoneGrid({
  month,
  today,
  onDay,
  picked,
  pick,
}: GridProps & { picked: string; pick: (date: string) => void }) {
  return (
    <Grid
      month={month}
      long={false}
      day={(date) => {
        const all = onDay.get(date) ?? [];
        const cancelled = all.filter(isCancelled).length;
        const count = all.length - cancelled;
        return (
          <td key={date} className={cellClass(date, month)}>
            <button
              type="button"
              className="day"
              aria-pressed={date === picked}
              aria-current={date === today ? 'date' : undefined}
              aria-label={[formatDate(date), ...dayCounts(count, cancelled)].join(', ')}
              onClick={() => pick(date)}
            >
              {dayOfMonth(date)}
              {/* A day with only cancelled Appointments has a hollow mark. */}
              {all.length > 0 && (
                <span className={count > 0 ? 'mark' : 'mark cancelled'} aria-hidden="true" />
              )}
            </button>
          </td>
        );
      }}
    />
  );
}

/** On a desktop: each day's Appointments in its cell, by time and name. */
function DesktopGrid({ month, today, onDay }: GridProps) {
  const opened = useMatch('/appointments/:id/*')?.params.id;
  // A day whose cell has been opened out to show every Appointment on it.
  const [openedOut, setOpenedOut] = useState<string | null>(null);

  return (
    <Grid
      month={month}
      long
      day={(date) => {
        const all = onDay.get(date) ?? [];
        const shown = date === openedOut ? all : all.slice(0, CELL_LIMIT);
        const more = all.length - shown.length;
        return (
          <td
            key={date}
            className={cellClass(date, month)}
            aria-current={date === today ? 'date' : undefined}
          >
            <span className="day">{dayOfMonth(date)}</span>
            {shown.length > 0 && (
              <ul>
                {shown.map((appointment) => {
                  const { id, time, what } = appointment;
                  const cancelled = isCancelled(appointment);
                  return (
                    <li key={id}>
                      <Link
                        className={cancelled ? 'chip cancelled' : 'chip'}
                        to={`/appointments/${id}`}
                        aria-label={`${cancelled ? 'Cancelled: ' : ''}${formatTime(time)} ${what}, ${formatDate(date)}`}
                        aria-current={opened === id || undefined}
                      >
                        <strong>{formatTime(time)}</strong>
                        <span className="chip-what">{what}</span>
                        {cancelled && <span className="chip-state">Cancelled</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {more > 0 && (
              <button type="button" className="more" onClick={() => setOpenedOut(date)}>
                {more} more
              </button>
            )}
          </td>
        );
      }}
    />
  );
}

/** A day in short words, with the year only when it is not this year: "Thu, Nov 19". */
function dayHeading(date: string, today: string): string {
  const { weekday, month, day } = dateParts(date);
  const year = date.slice(0, 4) === today.slice(0, 4) ? '' : `, ${date.slice(0, 4)}`;
  return `${weekday}, ${month} ${day}${year}`;
}

/** On a phone, beneath the grid: the picked day's Appointments, then each day after it that has one. */
function DayList({
  picked,
  today,
  appointments,
}: {
  picked: string;
  today: string;
  appointments: Appointment[];
}) {
  const days = new Map<string, Appointment[]>([[picked, []]]);
  for (const appointment of appointments)
    if (appointment.date >= picked)
      days.set(appointment.date, [...(days.get(appointment.date) ?? []), appointment]);

  return (
    <section className="day-list" aria-label="Picked day">
      {[...days].map(([date, appointments]) => {
        const word = date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : null;
        return (
          <div className="day-group" key={date}>
            <h2>
              {dayHeading(date, today)}
              {word && <span className="muted"> {word}</span>}
            </h2>
            {appointments.length > 0 ? (
              <ul>
                {appointments.map((appointment) => (
                  <li key={appointment.id}>
                    <DayRow appointment={appointment} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nothing on this day.</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

/**
 * An Appointment beneath the grid: its time, then what it is, who with, where and the Driver, and
 * how many Reminders are still to be sent.
 */
function DayRow({ appointment }: { appointment: Appointment }) {
  const { id, time, what, withWhom, placeName } = appointment;
  const withAndWhere = joined(' · ', withWhom, placeName);
  const driver = driverSentence(appointment);
  // A cancelled one is marked so, and nothing else about it is shown: there is nothing to attend.
  if (isCancelled(appointment))
    return (
      <Link className="day-row cancelled" to={`/appointments/${id}`}>
        <span className="time">{formatTime(time)}</span>
        <span className="row-what">
          <strong>{what}</strong>
          <span className="badge">Cancelled</span>
        </span>
      </Link>
    );
  return (
    <Link className="day-row" to={`/appointments/${id}`}>
      <span className="time">{formatTime(time)}</span>
      <span className="row-what">
        <strong>{what}</strong>
        {withAndWhere && <span className="muted">{withAndWhere}</span>}
        {driver && <span className="muted">{driver}</span>}
        <ReminderCount appointment={appointment} />
      </span>
    </Link>
  );
}
