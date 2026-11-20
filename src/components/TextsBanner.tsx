import { Link } from 'react-router-dom';
import { useCalendar } from '../data/CalendarContext';
import { textTrouble } from '../lib/calendar';
import { troubleWords } from '../lib/textStatus';

/**
 * The banner on every screen while the most recent text to Susan did not get through: it failed,
 * was not confirmed delivered, could not be sent in time, or was not sent because her number was
 * not set. It says what happened to that text, and clears once a later text goes (textTrouble in
 * src/lib/calendar/alerts.ts).
 */
export function TextsBanner() {
  const { texts } = useCalendar();
  const found = texts ? textTrouble(texts) : null;
  if (!found) return null;
  const { words, opens, label } = troubleWords(found.trouble, found.text);
  return (
    <div className="texts-banner" role="alert">
      <p>{words}</p>
      <Link className="btn" to={opens}>
        {label}
      </Link>
    </div>
  );
}
