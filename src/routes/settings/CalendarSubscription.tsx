import { useEffect, useRef, useState } from 'react';
import { useCalendar } from '../../data/CalendarContext';
import { formatMoment } from '../../lib/localTime';
import { SettingsSection } from './SettingsSection';

/** What the section knows of the person's link. */
type Link =
  /** Still being read. */
  | 'reading'
  /** They have none. */
  | null
  /** They have one, made then. `address` is there only just after it was made. */
  | { madeAt: string; address?: string };

/**
 * The signed-in person's own link for seeing Susan's Appointments in their calendar app: get one,
 * copy it, replace it, switch it off. The link is shown in full only when it is made.
 */
export function CalendarSubscription() {
  const { client, timeZone } = useCalendar();
  const [link, setLink] = useState<Link>('reading');
  const [asking, setAsking] = useState<'replace' | 'off' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    client.subscriptionLink().then(
      (found) => current && setLink(found),
      () => {
        if (!current) return;
        setLink(null);
        setProblem('Could not check for your link. Check your connection and try again.');
      },
    );
    return () => {
      current = false;
    };
  }, [client]);

  /** Carries out a command, and says why if it failed. */
  async function carryOut(command: () => Promise<Link>) {
    setBusy(true);
    setProblem(null);
    setCopied(null);
    try {
      setLink(await command());
      setAsking(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  const make = () => carryOut(() => client.makeSubscriptionLink());
  const switchOff = () =>
    carryOut(async () => {
      await client.switchOffSubscriptionLink();
      return null;
    });

  async function copy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied('Copied.');
    } catch {
      field.current?.select();
      setCopied('Copy the selected link.');
    }
  }

  return (
    <SettingsSection title="Calendar subscription">
      <p>
        See Susan's Appointments in Apple Calendar, Google Calendar or Outlook, beside your own.
        Your link is yours alone. It shows active Appointments with who they are with, where, the
        Driver and the Note for Susan. Private notes are left out, and nothing can be changed
        through it.
      </p>

      {link === 'reading' && <p className="muted">Checking for your link…</p>}
      {link === null && <p>You have no link.</p>}
      {link && link !== 'reading' && !link.address && (
        <p>
          You have a link, made {formatMoment(link.madeAt, timeZone)}. It is shown in full only when
          it is made. If you no longer have it, get a new one.
        </p>
      )}
      {link && link !== 'reading' && link.address && (
        <div className="subscription-link">
          <div className="field">
            <label htmlFor="subscription-link">Your link</label>
            <input
              id="subscription-link"
              ref={field}
              readOnly
              value={link.address}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => copy(link.address!)}>
              Copy link
            </button>
            {copied && (
              <p role="status" className="muted">
                {copied}
              </p>
            )}
          </div>
          <p className="hint">
            Copy it now: it is shown only this once. Then add it to your calendar app as a calendar
            from a web address: in Apple Calendar, “Add Subscribed Calendar”; in Google Calendar,
            “From URL”; in Outlook, “Subscribe from web”. Your calendar app checks for changes on
            its own schedule, which for Google Calendar can be several hours.
          </p>
          <p className="hint">
            Anyone who has the link can see the Appointments. If it gets out, get a new link or
            switch it off.
          </p>
        </div>
      )}

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}

      {asking === 'replace' && (
        <div className="card confirm" role="group" aria-label="Get a new link?">
          <p>
            <strong>Get a new link?</strong> Your old link stops working at once. A calendar app it
            was added to may keep showing the Appointments it last read until you remove the
            calendar there.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={make}>
              Yes, get a new link
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setAsking(null)}>
              No, keep it
            </button>
          </div>
        </div>
      )}
      {asking === 'off' && (
        <div className="card confirm" role="group" aria-label="Switch off your link?">
          <p>
            <strong>Switch off your link?</strong> It stops working at once: the calendar is no
            longer served at it. A calendar app it was added to may keep showing the Appointments it
            last read until you remove the calendar there.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-danger" disabled={busy} onClick={switchOff}>
              Yes, switch it off
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setAsking(null)}>
              No, keep it
            </button>
          </div>
        </div>
      )}

      {!asking && link === null && (
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={make}>
            Get my link
          </button>
        </div>
      )}
      {!asking && link && link !== 'reading' && (
        <div className="actions">
          <button type="button" className="btn" onClick={() => setAsking('replace')}>
            Get a new link
          </button>
          <button type="button" className="btn" onClick={() => setAsking('off')}>
            Switch off link
          </button>
        </div>
      )}
    </SettingsSection>
  );
}
