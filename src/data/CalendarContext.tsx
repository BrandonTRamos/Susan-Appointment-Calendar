import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Appointment, CalendarAlert, Reply, Text } from '../lib/calendar';
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
  /** Every Reply Susan sent, oldest first, kept up to date. Null until they have been read. */
  replies: Reply[] | null;
  /** Every calendar Alert, such as that texts to Susan are blocked. Null until read. */
  calendarAlerts: CalendarAlert[] | null;
  /**
   * When the newest Reply this person has seen arrived: null when they have seen none, undefined
   * until it has been read.
   */
  repliesSeenUpTo: string | null | undefined;
  /** Records that this person has seen every Reply up to `upTo`. */
  seeReplies: (upTo: string) => void;
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
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [calendarAlerts, setCalendarAlerts] = useState<CalendarAlert[] | null>(null);
  const [seenUpTo, setSeenUpTo] = useState<string | null | undefined>(undefined);
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
  useEffect(
    () => client.watchReplies(setReplies, () => setFailedWhile(watching)),
    [client, watching],
  );
  useEffect(
    () => client.watchCalendarAlerts(setCalendarAlerts, () => setFailedWhile(watching)),
    [client, watching],
  );
  // Read afresh with the rest, since another of this person's devices may have seen more. Never
  // taken back to an older moment than one already known.
  useEffect(() => {
    let current = true;
    client.repliesSeen().then(
      (found) => current && setSeenUpTo((known) => later(known, found)),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [client, watching]);
  const seeReplies = useCallback(
    (upTo: string) => {
      setSeenUpTo((known) => later(known, upTo));
      client.seeReplies(upTo).then(
        (kept) => setSeenUpTo((known) => later(known, kept)),
        // Not recorded: the count comes back when the app is next read, and nothing else is lost.
        () => {},
      );
    },
    [client],
  );

  return (
    <CalendarContext.Provider
      value={{
        client,
        timeZone,
        appointments,
        texts,
        replies,
        calendarAlerts,
        repliesSeenUpTo: seenUpTo,
        seeReplies,
        failed: failedWhile === watching,
        retry: () => setAttempt((n) => n + 1),
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}

/** The later of two moments, either of which may not be known. */
function later(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

export function useCalendar(): CalendarState {
  const calendar = useContext(CalendarContext);
  if (!calendar) throw new Error('useCalendar must be used inside a CalendarProvider.');
  return calendar;
}
