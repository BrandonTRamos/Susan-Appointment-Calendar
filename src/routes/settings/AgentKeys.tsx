import { useEffect, useRef, useState } from 'react';
import { Field } from '../../components/Field';
import { newestFirst, type AgentKeyListing } from '../../data/calendarClient';
import { useCalendar } from '../../data/CalendarContext';
import { AGENT_KEY_NAME_LIMIT, type MadeAgentKey } from '../../lib/calendar';
import { formatMoment } from '../../lib/localTime';
import { SettingsSection } from './SettingsSection';

/**
 * The signed-in person's own keys for connecting their AI agent to the calendar through the MCP
 * server: make one, see it once, revoke one. Only a hash of each is kept.
 */
export function AgentKeys() {
  const { client, timeZone } = useCalendar();
  /** Null while being read. */
  const [keys, setKeys] = useState<AgentKeyListing[] | null>(null);
  const [name, setName] = useState('');
  /** The key just made, shown this once. */
  const [made, setMade] = useState<MadeAgentKey | null>(null);
  /** The key being asked about revoking. */
  const [asking, setAsking] = useState<AgentKeyListing | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const endpoint = client.agentEndpoint();

  useEffect(() => {
    let current = true;
    client.agentKeys().then(
      (found) => current && setKeys(found),
      () => {
        if (!current) return;
        setKeys([]);
        setProblem('Could not read your keys. Check your connection and try again.');
      },
    );
    return () => {
      current = false;
    };
  }, [client]);

  /**
   * Carries out a command, and says why if it failed. The list is changed here rather than read
   * again, since a read can lag a moment behind the command.
   */
  async function carryOut(command: () => Promise<void>) {
    setBusy(true);
    setProblem(null);
    setCopied(null);
    try {
      await command();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  const make = () =>
    carryOut(async () => {
      const key = await client.makeAgentKey(name);
      setMade(key);
      setName('');
      const listed = { hash: key.hash, name: key.name, madeAt: key.madeAt };
      setKeys((now) => newestFirst([listed, ...(now ?? []).filter((k) => k.hash !== key.hash)]));
    });
  const revoke = (key: AgentKeyListing) =>
    carryOut(async () => {
      await client.revokeAgentKey(key.hash);
      setAsking(null);
      if (made?.hash === key.hash) setMade(null);
      setKeys((now) => (now ?? []).filter((k) => k.hash !== key.hash));
    });

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied('Copied.');
    } catch {
      field.current?.select();
      setCopied('Copy the selected key.');
    }
  }

  return (
    <SettingsSection title="Agent keys">
      <p>
        Let your AI agent, such as Claude, read Susan's calendar and change it for you when you ask
        it to. Everything it changes is recorded as yours, via agent, and follows the same rules as
        a change made here: the other Admins are told, and Susan is texted as she would be. An agent
        cannot see Settings, keys, subscription links or accounts.
      </p>

      {made && (
        <div className="subscription-link agent-key">
          <div className="field">
            <label htmlFor="agent-key">Your new key</label>
            <input
              id="agent-key"
              ref={field}
              readOnly
              value={made.key}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => copy(made.key)}>
              Copy key
            </button>
            {copied && (
              <p role="status" className="muted">
                {copied}
              </p>
            )}
          </div>
          {endpoint && (
            <div className="field">
              <label htmlFor="agent-endpoint">Address to connect to</label>
              <input
                id="agent-endpoint"
                readOnly
                value={endpoint}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
          )}
          <p className="hint">
            Copy it now: it is shown only this once. Add the calendar to your agent as a remote MCP
            server at the address above, sending the key as the header “Authorization: Bearer” and
            then the key. The README says how for Claude.
          </p>
          <p className="hint">
            Anyone who has the key can change the calendar as you. If it gets out, revoke it.
          </p>
        </div>
      )}

      {keys === null && <p className="muted">Checking for your keys…</p>}
      {keys?.length === 0 && <p>You have no agent keys.</p>}
      {keys && keys.length > 0 && (
        <ul className="agent-keys">
          {keys.map((key) => (
            <li key={key.hash}>
              <div>
                <strong>{key.name}</strong>
                <p className="muted">Made {formatMoment(key.madeAt, timeZone)}</p>
              </div>
              {asking?.hash !== key.hash && (
                <button
                  type="button"
                  className="btn"
                  aria-label={`Revoke ${key.name}`}
                  onClick={() => setAsking(key)}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {asking && (
        <div className="card confirm" role="group" aria-label={`Revoke ${asking.name}?`}>
          <p>
            <strong>Revoke {asking.name}?</strong> It stops working at once: an agent using it can
            no longer read or change the calendar. Changes it made stay as they are.
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => revoke(asking)}
            >
              Yes, revoke it
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setAsking(null)}>
              No, keep it
            </button>
          </div>
        </div>
      )}

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}

      <form
        className="agent-key-new"
        onSubmit={(event) => {
          event.preventDefault();
          void make();
        }}
      >
        <Field label="Name for a new key" hint="Such as the agent or device it is for.">
          {(ids) => (
            <input
              {...ids}
              value={name}
              maxLength={AGENT_KEY_NAME_LIMIT}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Create key
          </button>
        </div>
      </form>
    </SettingsSection>
  );
}
