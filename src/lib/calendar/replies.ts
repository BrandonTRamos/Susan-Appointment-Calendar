// Replies: the texts Susan sends back. The calendar keeps each one, passes it on to every Admin for
// a person to read, and answers her automatically, at most once in a while. It never reads what she
// wrote for meaning: no word in a Reply changes, cancels or confirms anything. Pure, so that the
// scheduled run and the screens decide the same way.

import { formatMoment } from '../localTime';
import { troubleOf, type Alert } from './alerts';
import { basicCharacters } from './reminders';
import { formatPhone, type CalendarSettings, type MessageProgress, type Text } from './texts';

export const REPLY_ANSWERS = ['due', 'sent', 'recent', 'numberChanged'] as const;
/**
 * What became of the automatic answer to a Reply. Due: the next scheduled run decides. Sent: the
 * automatic answer was sent for it (its text's record, `answerTextId`, says how that went). Recent:
 * none, because one was sent less than AUTOMATIC_ANSWER_GAP before. NumberChanged: none, because
 * Susan's mobile number in Settings changed after it came, so the number it came from is no longer
 * the one texts go to.
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
  /**
   * Which of Susan's numbers it came from, as the revision of her number in Settings when it came
   * (CalendarSettings.numberRevision), never the number itself. The automatic answer goes only
   * while her number is still that one.
   */
  numberRevision: number;
  answer: ReplyAnswer;
  /** The record of the automatic answer sent for it, once one was. */
  answerTextId: string | null;
  /** How far passing it on to every Admin has got. */
  passOn: MessageProgress;
}

/**
 * A Reply as the text sender's inbound side hands it over (amplify/calendar/textbelt.ts): its
 * words and the number it came from. `key` is what identifies it, the same each time the same
 * Reply arrives; null when there is nothing to tell it by. Only one from Susan's number in Settings
 * is kept.
 */
export interface IncomingReply {
  key: string | null;
  words: unknown;
  from: unknown;
}

/**
 * The automatic answer goes at most once in this long, measured from when the last one was claimed
 * for sending: a run of Replies, or a backlog of them taken up together, does not produce a run of
 * answers.
 */
export const AUTOMATIC_ANSWER_GAP = 60 * 60_000;

/** As much of a Reply as is kept: ten text messages' worth, far more than she will write. */
export const REPLY_WORDS_LIMIT = 1600;

/**
 * The ID of the nth automatic answer ever sent. Each is claimed under the next number after the
 * last one a run can see, so two runs that both see the same last answer claim the same ID, and
 * only one of them can: the gap holds even for runs that overlap.
 */
export const automaticAnswerTextId = (n: number) => `automaticAnswer:${n}`;

/** Which automatic answer an ID names, or null when it is not one. */
export function automaticAnswerNumber(id: string): number | null {
  const n = /^automaticAnswer:(\d+)$/.exec(id)?.[1];
  return n === undefined ? null : Number(n);
}

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
    numberChanged:
      "She was not sent the automatic answer: Susan's mobile number was changed in Settings after it came.",
  };
  const subject = "Susan's Calendar: Susan texted back";
  const lead = `Susan texted back to the calendar's number, ${when}:`;
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
      title: 'Susan texted back',
      body: quoted(short),
      opens: '/replies',
      // Each Reply stands on its own on a device: a later one does not take its place.
      tag: `reply-${reply.id}`,
    },
  };
}
