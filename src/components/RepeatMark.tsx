import type { Appointment } from '../lib/calendar';
import { RepeatIcon } from './Icons';

/**
 * Marks an Appointment that belongs to a Series, in a list, so that a person can tell at a glance
 * which kind of change they would be making, and that the clocks moved it on when they did.
 * Nothing for one entered on its own.
 */
export function RepeatMark({ appointment }: { appointment: Appointment }) {
  if (!appointment.series) return null;
  return (
    <span className="repeats">
      <RepeatIcon size={18} />
      {appointment.series.shiftedFrom ? 'Repeats · moved for the clock change' : 'Repeats'}
    </span>
  );
}
