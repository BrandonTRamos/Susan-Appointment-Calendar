import { useId } from 'react';
import { TextStatus } from '../components/TextStatus';
import { useInPanel } from '../components/Page';
import {
  changeNoticeOwed,
  changeNoticeWords,
  holdsWebAddress,
  textsAbout,
  type Appointment,
  type Text,
} from '../lib/calendar';
import { formatMoment } from '../lib/localTime';
import {
  changeNoticeStatus,
  KIND_NAMES,
  textStatus,
  WEB_ADDRESS_WARNING,
  webAddressStatus,
} from '../lib/textStatus';

// Every text recorded about an Appointment, Reminders and Change notices alike, with its status and
// its exact words, and first any Change notice still to go out.

export function TextList({
  appointment,
  texts,
  timeZone,
  now,
}: {
  appointment: Appointment;
  texts: readonly Text[] | null;
  timeZone: string;
  now: Date;
}) {
  const headingId = useId();
  const Heading = useInPanel() ? 'h3' : 'h2';
  const about = textsAbout(appointment.id, texts ?? []);
  // A Change notice owed and not yet recorded: the scheduled run records it once it is due.
  const owed = texts && changeNoticeOwed(appointment, texts, now, timeZone);
  const coming = owed && !about.some((text) => text.id === owed.id) ? owed : null;
  const comingWords =
    coming &&
    changeNoticeWords(
      appointment,
      coming,
      { dueAt: coming.plan === 'later' ? coming.dueAt : now },
      timeZone,
    );
  // Like any text, one whose words hold a web address will not be sent (webAddress.ts).
  const linked = comingWords !== null && holdsWebAddress(comingWords);
  return (
    <section className="texts" aria-labelledby={headingId}>
      <Heading id={headingId}>Texts to Susan</Heading>
      {texts === null && <p className="muted">Reading the texts…</p>}
      {texts !== null && about.length === 0 && (
        <p>No text about this Appointment has come due yet.</p>
      )}
      {about.length > 0 && (
        <ul aria-label="Texts to Susan">
          {coming && (
            <li className="reminder">
              <p>
                <strong>{KIND_NAMES.changeNotice}</strong>
                {`, due ${formatMoment(coming.dueAt, timeZone)}`}
              </p>
              <TextStatus status={linked ? webAddressStatus() : changeNoticeStatus(coming)} />
              <p className="quoted">{comingWords}</p>
              {linked && <p className="warning">{WEB_ADDRESS_WARNING}</p>}
            </li>
          )}
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
