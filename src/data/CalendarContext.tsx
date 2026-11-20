import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Appointment, Text } from '../lib/calendar';
import { useResumeCount } from '../lib/resume';
import type { CalendarClient } from './calendarClient';

export interface CalendarState {
  /** Carries out the core's commands. */
  client: CalendarClient;
  /** Susan's time zone (src/lib/timeZone.ts). */
  timeZone: string;
  /** Every Appointment in date order, kept up to date. Null until the calendar has been read. */
  appointments: Appointment[] | null;
  /** The record of every text to Susan, kept up to date. Null until it has been read. */
  texts: Text[] | null;
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
  const [texts, setTexts] = useState<Text[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const resumed = useResumeCount();
  // Each new value reads the calendar and listens for changes afresh.
  const watching = `${resumed}:${attempt}`;
  // A failure stands until the calendar is read afresh. Hearing of one more change, such as the
  // answer to this person's own command, does not mean changes are being heard again.
  const [failedWhile, setFailedWhile] = useState<string | null>(null);

  useEffect(
    () => client.watchAppointments(setAppointments, () => setFailedWhile(watching)),
    [client, watching],
  );
  useEffect(() => client.watchTexts(setTexts, () => setFailedWhile(watching)), [client, watching]);

  return (
    <CalendarContext.Provider
      value={{
        client,
        timeZone,
        appointments,
        texts,
        failed: failedWhile === watching,
        retry: () => setAttempt((n) => n + 1),
      }}
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
