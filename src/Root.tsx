import { signOut } from 'aws-amplify/auth';
import { App } from './App';
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
}

/**
 * What an address shows. The public pages open for anyone, with no session looked for; every other
 * address shows the calendar to a signed-in person and the sign-in screen to anyone else.
 *
 * The address is read once: every way between a public page and the calendar is a plain link, which
 * loads the page afresh.
 */
export function Root({ backend, timeZone, contactEmail, ownerName }: RootProps) {
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
  if (!backend) return <App displayName={null} timeZone={timeZone} sampleData />;
  return (
    <SignedIn>
      {(person) => (
        <App displayName={person.displayName} timeZone={timeZone} onSignOut={() => signOut()} />
      )}
    </SignedIn>
  );
}
