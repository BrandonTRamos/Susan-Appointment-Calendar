import { useId } from 'react';
import { TextStatus } from '../components/TextStatus';
import { useInPanel } from '../components/Page';
import { textsAbout, type Appointment, type Text } from '../lib/calendar';
import { formatMoment } from '../lib/localTime';
import { KIND_NAMES, textStatus } from '../lib/textStatus';

// Every text recorded about an Appointment, with its status and its exact words. Kept apart from
// the detail so that later kinds of text (Change notices) join it here.

export function TextList({
  appointment,
  texts,
  timeZone,
}: {
  appointment: Appointment;
  texts: readonly Text[] | null;
  timeZone: string;
}) {
  const headingId = useId();
  const Heading = useInPanel() ? 'h3' : 'h2';
  const about = textsAbout(appointment.id, texts ?? []);
  return (
    <section className="texts" aria-labelledby={headingId}>
      <Heading id={headingId}>Texts to Susan</Heading>
      {texts === null && <p className="muted">Reading the texts…</p>}
      {texts !== null && about.length === 0 && (
        <p>No text about this Appointment has come due yet.</p>
      )}
      {about.length > 0 && (
        <ul aria-label="Texts to Susan">
          {about.map((text) => (
            <li key={text.id} className="reminder">
              <p>
                <strong>{KIND_NAMES[text.kind]}</strong>
                {`, due ${formatMoment(text.dueAt, timeZone)}`}
              </p>
              <TextStatus status={textStatus(text, timeZone)} />
              <p className="quoted">{text.words}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
