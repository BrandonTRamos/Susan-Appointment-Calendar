import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { TextStatus } from '../components/TextStatus';
import { useCalendar } from '../data/CalendarContext';
import { automaticAnswerId, newestFirst, type Reply, type Text } from '../lib/calendar';
import { formatMoment } from '../lib/localTime';
import { textStatus } from '../lib/textStatus';

/**
 * Susan's Replies, newest first, each with when it came and what became of the automatic answer.
 * Opening the tab counts every Reply in it as seen by this person; the ones that were new when it
 * opened stay marked as new while it is open.
 */
export function Replies() {
  const { replies, texts, timeZone, repliesSeenUpTo, seeReplies } = useCalendar();
  const listed = replies ? newestFirst(replies) : null;
  const newest = listed?.[0]?.receivedAt ?? null;

  // What this person had seen when the tab opened, once known.
  const [seenBefore, setSeenBefore] = useState<string | null | undefined>(repliesSeenUpTo);
  if (seenBefore === undefined && repliesSeenUpTo !== undefined) setSeenBefore(repliesSeenUpTo);

  useEffect(() => {
    if (newest) seeReplies(newest);
  }, [newest, seeReplies]);

  return (
    <Page title="Replies">
      <p className="muted replies-intro">
        Texts Susan sends back to the calendar's number. Each is passed on to every Admin by email
        and app notification. The calendar never acts on what she writes: if something needs doing,
        call her.
      </p>
      {listed === null && <p className="muted">Reading the Replies…</p>}
      {listed?.length === 0 && <p>No Replies yet.</p>}
      {listed && listed.length > 0 && (
        <ul className="replies" aria-label="Replies">
          {listed.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              answer={texts?.find((text) => text.id === automaticAnswerId(reply)) ?? null}
              isNew={
                seenBefore !== undefined && (seenBefore === null || reply.receivedAt > seenBefore)
              }
              timeZone={timeZone}
            />
          ))}
        </ul>
      )}
    </Page>
  );
}

function ReplyItem({
  reply,
  answer,
  isNew,
  timeZone,
}: {
  reply: Reply;
  answer: Text | null;
  isNew: boolean;
  timeZone: string;
}) {
  return (
    <li className="reply">
      <p className="reply-when">
        <strong>{formatMoment(reply.receivedAt, timeZone)}</strong>
        {isNew && <span className="badge new">New</span>}
      </p>
      <p className="quoted reply-words">{reply.words || '(It had no words.)'}</p>
      {reply.answer === 'notSusan' && (
        <p className="muted">
          From a number that is not Susan's mobile number in Settings, so no automatic answer was
          sent.
        </p>
      )}
      {reply.answer === 'recent' && (
        <p className="muted">No automatic answer: she had one less than an hour before.</p>
      )}
      {reply.answer === 'due' && (
        <p className="muted">The automatic answer goes within a minute.</p>
      )}
      {reply.answer === 'sent' && answer && (
        <div className="reply-answer">
          <p className="muted">Automatic answer:</p>
          <TextStatus status={textStatus(answer, timeZone)} />
        </div>
      )}
    </li>
  );
}
