import { useEffect, useState } from 'react';
import {
  appNotificationState,
  turnOff,
  turnOn,
  type AppNotificationState,
  type DeviceRegistry,
} from '../../lib/appNotifications';
import { SettingsSection } from './SettingsSection';

/** Settings → App notifications: turns them on or off for the device in hand. */
export function AppNotifications({ devices }: { devices: DeviceRegistry | null }) {
  const [state, setState] = useState<AppNotificationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    appNotificationState(devices).then(
      (found) => live && setState(found),
      () => live && setState('off'),
    );
    return () => {
      live = false;
    };
  }, [devices]);

  const change = async (
    to: (registry: DeviceRegistry) => Promise<AppNotificationState>,
    failure: string,
  ) => {
    if (!devices) return;
    setBusy(true);
    setFailed(null);
    try {
      setState(await to(devices));
    } catch (error) {
      console.warn(failure, error);
      setFailed(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title="App notifications">
      <p>
        An Activity update on this device whenever someone else adds, changes or cancels an
        Appointment. Tap one to open that Appointment. They go only to Admins, never to Susan.
      </p>
      {state === 'unavailable' && (
        <p className="muted">
          {devices
            ? 'This browser cannot show notifications. Try another browser, or the app on your phone.'
            : 'Not available on sample data.'}
        </p>
      )}
      {state === 'home-screen' && (
        <p className="muted">
          On an iPhone, the app must first be added to the home screen. In Safari, tap Share, then
          Add to Home Screen. Open Susan's Calendar from the home screen and turn notifications on
          here.
        </p>
      )}
      {state === 'blocked' && (
        <p className="muted">
          Notifications are blocked for this app on this device. Allow them in the device's
          settings, then come back here.
        </p>
      )}
      {state === 'off' && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() =>
            void change(
              turnOn,
              'Could not turn notifications on. Check your connection and try again.',
            )
          }
        >
          {busy ? 'Turning on…' : 'Turn on for this device'}
        </button>
      )}
      {state === 'on' && (
        <>
          <p role="status">On for this device.</p>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              void change(
                turnOff,
                'Could not turn notifications off. Check your connection and try again.',
              )
            }
          >
            {busy ? 'Turning off…' : 'Turn off for this device'}
          </button>
        </>
      )}
      {failed && (
        <p className="error" role="alert">
          {failed}
        </p>
      )}
    </SettingsSection>
  );
}
