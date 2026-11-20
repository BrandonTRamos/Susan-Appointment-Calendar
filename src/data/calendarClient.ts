// What the screens read and do. Two things supply it: the data API (amplifyCalendar.ts) and sample
// data (sampleCalendar.ts). Either way the calendar is only ever changed by the calendar core's
// commands (src/lib/calendar); a screen never writes calendar data itself.

import type {
  Appointment,
  AppointmentChanges,
  AgentKey,
  CalendarSettings,
  MadeAgentKey,
  NewAppointment,
  NewSeries,
  Series,
  SeriesChanges,
  SettingsChanges,
  Text,
} from '../lib/calendar';

export interface CalendarClient {
  /**
   * Keeps `listener` told of every Appointment in the calendar, in date order: once they have been
   * read, and again after every change, whoever made it. `onError` is called when the calendar
   * could not be read or kept up to date. Returns how to stop.
   */
  watchAppointments(
    listener: (appointments: Appointment[]) => void,
    onError: (error: Error) => void,
  ): () => void;

  // The core's commands, carried out as the signed-in person. Each rejects with a CalendarRefusal
  // when the core refuses, and with any other error when the command could not be carried out.
  /** `id` is the new Appointment's ID, a UUID chosen here so that sending the add twice adds one. */
  addAppointment(details: NewAppointment, id?: string): Promise<Appointment>;
  changeAppointment(id: string, changes: AppointmentChanges): Promise<Appointment>;
  cancelAppointment(id: string): Promise<Appointment>;
  deleteAppointment(id: string): Promise<void>;
  /**
   * Adds a Series and answers with its first Appointment. The others reach the calendar as it is
   * kept up to date. `id` is the Series' ID, chosen here so that sending the add twice adds one.
   */
  addSeries(details: NewSeries, id?: string): Promise<Appointment>;
  /** Changes this Appointment and all later ones in its Series; answers with this one. */
  changeSeries(id: string, changes: SeriesChanges): Promise<Appointment>;
  /** Cancels this Appointment and all later ones in its Series; answers with this one. */
  endSeries(id: string): Promise<Appointment>;
  /** The Series with this ID, read once, or null when the calendar has none. */
  series(id: string): Promise<Series | null>;

  // The signed-in person's own calendar subscription link (src/lib/calendar/subscription.ts).
  /** When their link was made, or null when they have none. */
  subscriptionLink(): Promise<{ madeAt: string } | null>;
  /**
   * Makes them a new link, which switches off any they had, and answers with the address to paste
   * into a calendar app. This is the only time the address is seen in full.
   */
  makeSubscriptionLink(): Promise<{ address: string; madeAt: string }>;
  switchOffSubscriptionLink(): Promise<void>;

  // The signed-in person's own agent keys (src/lib/calendar/agentKeys.ts).
  /** Their keys, newest first. Each is named by its hash to revoke it; the key itself is not kept. */
  agentKeys(): Promise<AgentKeyListing[]>;
  /** Makes them a new key and answers with it. This is the only time the key is seen in full. */
  makeAgentKey(name: string): Promise<MadeAgentKey>;
  revokeAgentKey(hash: string): Promise<void>;
  /** The MCP server's address an agent connects to, or null when the backend has none. */
  agentEndpoint(): string | null;

  // Texts to Susan (src/lib/calendar/texts.ts).
  /**
   * Keeps `listener` told of the record of every text, as `watchAppointments` does Appointments:
   * once read, and again after every change, such as a text being sent.
   */
  watchTexts(listener: (texts: Text[]) => void, onError: (error: Error) => void): () => void;
  /** Where texts go, and who Susan is told to call. */
  settings(): Promise<CalendarSettings>;
  changeSettings(changes: SettingsChanges): Promise<CalendarSettings>;
  /** Sends Susan a test text now, and answers with its record. */
  sendTestText(): Promise<Text>;
  /**
   * Whether texts are only recorded, by the stand-in sender, and reach no phone: on sample data,
   * and wherever the backend has no Textbelt key. Asked of the backend, since the key is a secret
   * that can be stored after a deploy.
   */
  textsRecordedOnly(): Promise<boolean>;
}

/** Said when a backend has no address for the feed, so a link cannot be made. */
export const NO_FEED = 'Calendar subscription is not set up yet.';

/** An agent key as a person sees it listed. */
export type AgentKeyListing = Pick<AgentKey, 'hash' | 'name' | 'madeAt'>;

/** Newest first. */
export const newestFirst = (keys: AgentKeyListing[]) =>
  [...keys].sort((a, b) => b.madeAt.localeCompare(a.madeAt) || a.name.localeCompare(b.name));
