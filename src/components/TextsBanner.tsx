import { Link } from 'react-router-dom';
import { useCalendar } from '../data/CalendarContext';
import { blockedSince, textTrouble } from '../lib/calendar';
import { BLOCKED_BANNER, troubleWords } from '../lib/textStatus';

/**
 * The banner on every screen while texts to Susan are blocked, until a text is delivered again
 * (blockedSince in src/lib/calendar/alerts.ts); or else while the most recent text to Susan did
 * not get through: it failed, was not confirmed delivered, could not be sent in time, or was not
 * sent because her number was not set. It says what happened to that text, and clears once a later
 * text goes (textTrouble).
 */
export function TextsBanner() {
  const { texts, calendarAlerts } = useCalendar();
  const blocked = texts ? blockedSince(texts, calendarAlerts ?? []) !== null : false;
  const found = texts && !blocked ? textTrouble(texts) : null;
  if (!blocked && !found) return null;
  const { words, opens, label } = found ? troubleWords(found.trouble, found.text) : BLOCKED_BANNER;
  return (
    <div className="texts-banner" role="alert">
      <p>{words}</p>
      <Link className="btn" to={opens}>
        {label}
      </Link>
    </div>
  );
}
