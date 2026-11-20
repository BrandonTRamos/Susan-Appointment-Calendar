import { useCalendar } from '../data/CalendarContext';

/**
 * Says so when the calendar could not be read, or when what is showing may be out of date, and
 * offers to read it again. Shows nothing otherwise.
 */
export function CalendarTrouble() {
  const { appointments, failed, retry } = useCalendar();
  if (!failed) return null;
  return (
    <div className="trouble" role="alert">
      <p>
        {appointments
          ? 'This may be out of date. Check your connection.'
          : 'Could not load the calendar. Check your connection.'}
      </p>
      <button type="button" className="btn" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

/** Shown while the calendar is being read for the first time. */
export function CalendarLoading() {
  return (
    <p className="spinner" role="status">
      Loading the calendar…
    </p>
  );
}
