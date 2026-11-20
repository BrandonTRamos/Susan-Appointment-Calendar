import { useEffect, useState, type FormEvent } from 'react';
import { Field } from '../../components/Field';
import { TextStatus } from '../../components/TextStatus';
import { useCalendar } from '../../data/CalendarContext';
import {
  CalendarRefusal,
  formatPhone,
  type CalendarSettings,
  type SettingsChanges,
} from '../../lib/calendar';
import { textStatus } from '../../lib/textStatus';
import { SettingsSection } from './SettingsSection';

/** The settings as the form holds them, as typed. */
interface Typed {
  susansNumber: string;
  contactName: string;
  contactPhone: string;
}

/**
 * What a save sends: only the settings the person changed from those this page read, so that a
 * page left open never puts back what another page saved since. Her number as this page read it
 * goes with them when it has no destination ID yet (Settings kept before Replies): saving confirms
 * it, and the calendar binds it only if it is still that number.
 */
function settingsToSave(read: CalendarSettings, typed: Typed): SettingsChanges {
  const was = typedFrom(read);
  const changes: SettingsChanges = {};
  for (const name of ['susansNumber', 'contactName', 'contactPhone'] as const)
    if (typed[name].trim() !== was[name].trim()) changes[name] = typed[name];
  if (read.susansNumber && read.numberId === null && changes.susansNumber === undefined)
    changes.confirmSusansNumber = read.susansNumber;
  return changes;
}

const typedFrom = (settings: CalendarSettings): Typed => ({
  susansNumber: settings.susansNumber ? formatPhone(settings.susansNumber) : '',
  contactName: settings.contactName ?? '',
  contactPhone: settings.contactPhone ? formatPhone(settings.contactPhone) : '',
});

/**
 * Where texts go: Susan's mobile number, and the name and number the automatic answer to a Reply
 * tells her to call. With no number set nothing is sent, and this says so. A test text proves the
 * whole path, and its status shows here as it changes.
 */
export function SusansPhoneAndContact() {
  const { client, texts, timeZone } = useCalendar();
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [typed, setTyped] = useState<Typed>({
    susansNumber: '',
    contactName: '',
    contactPhone: '',
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testId, setTestId] = useState<string | null>(null);
  const [testProblem, setTestProblem] = useState<string | null>(null);
  const [recordedOnly, setRecordedOnly] = useState(false);

  useEffect(() => {
    let current = true;
    client.settings().then(
      (found) => {
        if (!current) return;
        setSettings(found);
        setTyped(typedFrom(found));
      },
      () =>
        current && setProblem('Could not read the settings. Check your connection and try again.'),
    );
    // Said only once known: until then, and if the backend cannot be asked, nothing is claimed.
    client.textsRecordedOnly().then(
      (only) => current && setRecordedOnly(only),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [client]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setSaved(false);
    try {
      const changed = await client.changeSettings(settingsToSave(settings!, typed));
      setSettings(changed);
      setTyped(typedFrom(changed));
      setSaved(true);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setTestProblem(null);
    try {
      setTestId((await client.sendTestText()).id);
    } catch (error) {
      setTestProblem(
        error instanceof CalendarRefusal || error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  }

  const change = (name: keyof Typed) => (event: { target: { value: string } }) => {
    setTyped({ ...typed, [name]: event.target.value });
    setSaved(false);
  };
  const test = texts?.find((text) => text.id === testId) ?? null;

  return (
    <SettingsSection title="Susan's phone and contact">
      {settings === null && !problem && <p className="muted">Reading the settings…</p>}
      {settings && !settings.susansNumber && (
        <p className="warning" role="note">
          No mobile number is set, so no texts are sent to Susan. Reminders that come due are
          recorded as not sent.
        </p>
      )}
      {settings?.susansNumber && settings.numberId === null && (
        <p className="hint muted" role="note">
          Save once to confirm Susan's number for automatic answers. Until then, a Reply she sends
          is still passed on, but she gets no automatic answer.
        </p>
      )}
      {recordedOnly && (
        <p className="hint muted">
          Texts are recorded here, not sent to a phone: the calendar is not yet connected to its
          text service.
        </p>
      )}
      {settings && (
        <form onSubmit={save} noValidate>
          <Field label="Susan's mobile number" hint="A US number. Every text goes to it.">
            {(ids) => (
              <input
                {...ids}
                type="tel"
                autoComplete="off"
                inputMode="tel"
                value={typed.susansNumber}
                onChange={change('susansNumber')}
              />
            )}
          </Field>
          <Field
            label="Who Susan should call"
            hint="When she replies to a text, the automatic answer tells her to call this person."
          >
            {(ids) => (
              <input
                {...ids}
                autoComplete="off"
                value={typed.contactName}
                onChange={change('contactName')}
              />
            )}
          </Field>
          <Field label="Their phone number">
            {(ids) => (
              <input
                {...ids}
                type="tel"
                autoComplete="off"
                inputMode="tel"
                value={typed.contactPhone}
                onChange={change('contactPhone')}
              />
            )}
          </Field>
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Save
            </button>
            {saved && (
              <p role="status" className="muted">
                Saved.
              </p>
            )}
          </div>
        </form>
      )}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {settings && (
        <div className="test-text">
          <p>
            A test text goes to Susan's mobile number by the same path as a Reminder, to prove that
            texts reach her phone.
          </p>
          <div className="actions">
            <button type="button" className="btn" disabled={busy} onClick={sendTest}>
              Send a test text
            </button>
          </div>
          {test && (
            <div role="status" aria-label="Test text">
              <TextStatus status={textStatus(test, timeZone)} />
            </div>
          )}
          {testProblem && (
            <p className="error" role="alert">
              {testProblem}
            </p>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
