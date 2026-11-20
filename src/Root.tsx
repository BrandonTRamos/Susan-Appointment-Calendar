import { signOut } from 'aws-amplify/auth';
import { useState } from 'react';
import { App } from './App';
import { createAmplifyCalendar } from './data/amplifyCalendar';
import { createSampleCalendar } from './data/sampleCalendar';
import { publicPageAt } from './lib/publicPage';
import { PublicPage } from './routes/PublicPage';
import { SignedIn } from './SignedIn';

export interface RootProps {
  /** False when there is no backend: the app shows sample data and nobody is signed in. */
  backend: boolean;
  /** Susan's time zone (src/lib/timeZone.ts). */
  timeZone: string;
  /** The public pages' contact address, or null when none is set. */
  contactEmail: string | null;
  /** Who runs the calendar, as the public pages name them, or null when no name is set. */
  ownerName: string | null;
  /** The calendar subscription feed's address, or null when the backend has none. */
  subscriptionFeedUrl?: string | null;
}

/**
 * What an address shows. The public pages open for anyone, with no session looked for; every other
 * address shows the calendar to a signed-in person and the sign-in screen to anyone else.
 *
 * The address is read once: every way between a public page and the calendar is a plain link, which
 * loads the page afresh.
 */
export function Root({
  backend,
  timeZone,
  contactEmail,
  ownerName,
  subscriptionFeedUrl = null,
}: RootProps) {
  const publicPage = publicPageAt(window.location.pathname);
  if (publicPage)
    return (
      <PublicPage
        page={publicPage}
        contactEmail={contactEmail}
        ownerName={ownerName}
        sampleData={!backend}
      />
    );
  if (!backend) return <SampleApp timeZone={timeZone} />;
  return (
    <SignedIn>
      {(person) => (
        <SignedInApp
          displayName={person.displayName}
          timeZone={timeZone}
          subscriptionFeedUrl={subscriptionFeedUrl}
        />
      )}
    </SignedIn>
  );
}

/** The calendar on sample data, with nobody signed in. Nothing is saved. */
function SampleApp({ timeZone }: { timeZone: string }) {
  const [calendar] = useState(() => createSampleCalendar(timeZone));
  return <App displayName={null} timeZone={timeZone} calendar={calendar} sampleData />;
}

/**
 * The calendar for a signed-in person. SignedIn mounts this afresh for each person, so what one
 * person's session read is never shown to the next.
 */
function SignedInApp({
  displayName,
  timeZone,
  subscriptionFeedUrl,
}: {
  displayName: string | null;
  timeZone: string;
  subscriptionFeedUrl: string | null;
}) {
  const [calendar] = useState(() => createAmplifyCalendar(subscriptionFeedUrl));
  return (
    <App
      displayName={displayName}
      timeZone={timeZone}
      calendar={calendar}
      onSignOut={() => signOut()}
    />
  );
}
