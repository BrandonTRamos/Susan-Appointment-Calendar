import type { StatusWords } from '../lib/textStatus';

/** The labels of a text that has gone: its badge is marked as good news. */
const GONE = new Set(['Sent', 'Delivered']);

/** A text's status: a word or two, then why or when. Its badge is coloured by how it stands. */
export function TextStatus({ status }: { status: StatusWords }) {
  const tone = status.trouble ? ' bad' : GONE.has(status.label) ? ' good' : '';
  return (
    <p className="text-status">
      <span className={`badge${tone}`}>{status.label}</span>
      {status.detail && ` ${status.detail}`}
    </p>
  );
}
