import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Appointment } from '../lib/calendar';
import { useResumeCount } from '../lib/resume';
import type { CalendarClient } from './calendarClient';

export interface CalendarState {
  /** Carries out the core's commands. */
  client: CalendarClient;
  /** Susan's time zone (src/lib/timeZone.ts). */
  timeZone: string;
  /** Every Appointment in date order, kept up to date. Null until the calendar has been read. */
  appointments: Appointment[] | null;
  /** The calendar could not be read, or what is showing may be out of date. */
  failed: boolean;
  /** Reads the calendar again. */
  retry: () => void;
}

const CalendarContext = createContext<CalendarState | null>(null);

/**
 * Reads the calendar once for every screen and keeps it up to date as anyone changes it. It reads
 * afresh whenever the app comes back to the foreground or back online: a phone stops listening
 * while the app is in the background.
 */
export function CalendarProvider({
  client,
  timeZone,
  children,
}: {
  client: CalendarClient;
  timeZone: string;
  children: ReactNode;
}) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const resumed = useResumeCount();

  useEffect(
    () =>
      client.watchAppointments(
        (all) => {
          setAppointments(all);
          setFailed(false);
        },
        () => setFailed(true),
      ),
    [client, resumed, attempt],
  );

  return (
    <CalendarContext.Provider
      value={{ client, timeZone, appointments, failed, retry: () => setAttempt((n) => n + 1) }}
    >
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar(): CalendarState {
  const calendar = useContext(CalendarContext);
  if (!calendar) throw new Error('useCalendar must be used inside a CalendarProvider.');
  return calendar;
}
