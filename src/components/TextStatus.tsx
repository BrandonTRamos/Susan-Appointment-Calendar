import type { StatusWords } from '../lib/textStatus';

/** A text's status: a word or two, then why or when. */
export function TextStatus({ status }: { status: StatusWords }) {
  return (
    <p className={status.trouble ? 'text-status warning' : 'text-status'}>
      <span className="badge">{status.label}</span>
      {status.detail && ` ${status.detail}`}
    </p>
  );
}
