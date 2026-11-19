// Every date and time in the calendar means Susan's local time, in one configured time zone. It
// never comes from the device or the server. Shared by the app and the backend.

/** US Eastern. */
export const DEFAULT_TIME_ZONE = 'America/New_York';

/**
 * Susan's time zone from the SUSAN_TIME_ZONE setting, or US Eastern when it isn't set. A value that
 * isn't a time zone is refused, not replaced: quietly falling back would shift every Appointment.
 */
export function resolveTimeZone(configured: string | undefined | null): string {
  const zone = configured?.trim();
  if (!zone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    throw new Error(
      `SUSAN_TIME_ZONE is not a time zone: "${zone}". Use a name such as ${DEFAULT_TIME_ZONE}.`,
    );
  }
  return zone;
}

/** The zone's everyday name, e.g. "Eastern Time". */
export function timeZoneName(zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    timeZoneName: 'longGeneric',
  }).formatToParts(new Date());
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? zone;
}
