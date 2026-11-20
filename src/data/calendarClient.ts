// What the screens read and do. Two things supply it: the data API (amplifyCalendar.ts) and sample
// data (sampleCalendar.ts). Either way the calendar is only ever changed by the calendar core's
// commands (src/lib/calendar); a screen never writes calendar data itself.

import type { Appointment, AppointmentChanges, NewAppointment } from '../lib/calendar';

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
}
