// Replies: the texts Susan sends back. The calendar keeps each one, passes it on to every Admin for
// a person to read, and answers her automatically, at most once in a while. It never reads what she
// wrote for meaning: no word in a Reply changes, cancels or confirms anything. Pure, so that the
// scheduled run and the screens decide the same way.

import { formatMoment } from '../localTime';
import { troubleOf, type Alert } from './alerts';
import { basicCharacters } from './reminders';
import { formatPhone, type CalendarSettings, type MessageProgress, type Text } from './texts';

export const REPLY_ANSWERS = ['due', 'sent', 'recent', 'notSusan'] as const;
/**
 * What became of the automatic answer to a Reply. Due: the next scheduled run decides. Sent: the
 * automatic answer was sent for it (its text's record says how that went). Recent: none, because
 * she was sent one less than AUTOMATIC_ANSWER_GAP before. NotSusan: none, because it came from a
 * number that was not Susan's mobile number in Settings, and texts go to nobody else.
 */
export type ReplyAnswer = (typeof REPLY_ANSWERS)[number];

/** A text Susan sent back to the number her texts come from. */
export interface Reply {
  /** Made from what the text sender said identifies it, so the same Reply is kept once. */
  id: string;
  /** What she wrote, as she wrote it: never read for meaning. */
  words: string;
  /** When the calendar received it, as an ISO timestamp. */
  receivedAt: string;
  /** Whether it came from Susan's mobile number as Settings had it then. */
  fromSusan: boolean;
  answer: ReplyAnswer;
  /** How far passing it on to every Admin has got. */
  passOn: MessageProgress;
}

/**
 * A Reply as the text sender's inbound side hands it over (amplify/calendar/textbelt.ts): its
 * words and the number it came from, unchecked. `key` is what identifies it, the same each time the
 * same Reply arrives; null when there is nothing to tell it by.
 */
export interface IncomingReply {
  key: string | null;
  words: unknown;
  from: unknown;
}

/**
 * The automatic answer goes at most once in this long: a run of Replies does not produce a run of
 * answers.
 */
export const AUTOMATIC_ANSWER_GAP = 60 * 60_000;

/** As much of a Reply as is kept: ten text messages' worth, far more than she will write. */
export const REPLY_WORDS_LIMIT = 1600;

/** The ID of the automatic answer to a Reply. */
export const automaticAnswerId = (reply: Pick<Reply, 'id'>) => `automaticAnswer:${reply.id}`;

/**
 * The automatic answer's words: replies are not answered, and who to call, from Settings. With no
 * contact set it still says so, and asks her to phone someone.
 */
export function automaticAnswerWords({
  contactName,
  contactPhone,
}: Pick<CalendarSettings, 'contactName' | 'contactPhone'>): string {
  const phone = contactPhone ? formatPhone(contactPhone) : null;
  const who = contactName && phone ? `${contactName} at ${phone}` : (phone ?? contactName ?? null);
  return basicCharacters(
    `Susan's Calendar: Texts to this number are not answered. If you need anything, please call ${
      who ?? 'someone who helps you'
    }.`,
  );
}

/** Replies, the newest first. */
export const newestFirst = (replies: readonly Reply[]) =>
  [...replies].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.id.localeCompare(a.id));

/** How many Replies came after the newest one a person has seen. */
export function repliesNotSeen(replies: readonly Reply[], seenUpTo: string | null): number {
  return replies.filter((reply) => seenUpTo === null || reply.receivedAt > seenUpTo).length;
}

/** How long an app notification quotes a Reply before it is cut short: it shows on a lock screen. */
const NOTIFICATION_QUOTE = 240;

const quoted = (words: string) => (words.trim() ? `"${words}"` : '(It had no words.)');

/**
 * A Reply as it is passed on to every Admin, quoting what she wrote: the words are for a person to
 * read and act on. It says that the calendar did not act on them, and whether she was answered.
 */
export function replyPassedOn(
  reply: Reply,
  settings: Pick<CalendarSettings, 'contactName' | 'contactPhone'>,
  timeZone: string,
  /** The record of the automatic answer to it, when there is one. */
  answer: Text | null = null,
): Alert {
  const when = formatMoment(reply.receivedAt, timeZone);
  const contact =
    settings.contactName ?? (settings.contactPhone && formatPhone(settings.contactPhone));
  const answered: Record<ReplyAnswer, string> = {
    sent:
      answer && troubleOf(answer)
        ? 'The automatic answer to her did not go: you are sent an Alert about it.'
        : `She was sent the automatic answer, saying texts to this number are not answered${
            contact ? ` and to call ${contact}` : ''
          }.`,
    due: 'She is being sent the automatic answer.',
    recent: 'She was not sent the automatic answer again: she had it less than an hour before.',
    notSusan: 'No automatic answer was sent: texts go only to Susan.',
  };
  const subject = reply.fromSusan
    ? "Susan's Calendar: Susan texted back"
    : "Susan's Calendar: a text came back from another number";
  const lead = reply.fromSusan
    ? `Susan texted back to the calendar's number, ${when}:`
    : `A text came back to the calendar's number, ${when}, from a number that is not Susan's mobile number in Settings:`;
  const body =
    `${lead}\n\n${quoted(reply.words)}\n\n` +
    'The calendar does not act on what she writes: nothing was changed, cancelled or confirmed. ' +
    `${answered[reply.answer]}\n\n` +
    'Her Replies are in the app.';
  const short =
    reply.words.length > NOTIFICATION_QUOTE
      ? `${reply.words.slice(0, NOTIFICATION_QUOTE).trimEnd()}...`
      : reply.words;
  return {
    email: { subject, body, opens: '/replies' },
    notification: {
      title: reply.fromSusan ? 'Susan texted back' : 'A text came back from another number',
      body: quoted(short),
      opens: '/replies',
      // Each Reply stands on its own on a device: a later one does not take its place.
      tag: `reply-${reply.id}`,
    },
  };
}
