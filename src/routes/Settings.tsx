import { Page } from '../components/Page';
import { SignOut } from '../components/SignOut';
import { timeZoneName } from '../lib/timeZone';
import { AgentKeys } from './settings/AgentKeys';
import { AppNotifications } from './settings/AppNotifications';
import { CalendarSubscription } from './settings/CalendarSubscription';
import { SusansPhoneAndContact } from './settings/SusansPhoneAndContact';

export function Settings({
  displayName,
  timeZone,
  sampleData,
  onSignOut,
}: {
  displayName: string | null;
  timeZone: string;
  sampleData: boolean;
  onSignOut?: () => Promise<unknown>;
}) {
  return (
    <Page title="Settings">
      <SusansPhoneAndContact />
      <AppNotifications />
      <CalendarSubscription />
      <AgentKeys />

      {onSignOut && (
        <div className="account">
          <p>{displayName ? `Signed in as ${displayName}` : 'Signed in'}</p>
          <SignOut onSignOut={onSignOut} />
        </div>
      )}

      <p className="muted about">
        Every time is Susan's local time ({timeZoneName(timeZone)}).
        <br />
        Susan's Calendar {__APP_VERSION__} · {sampleData ? 'sample data' : 'connected'}
      </p>
    </Page>
  );
}
