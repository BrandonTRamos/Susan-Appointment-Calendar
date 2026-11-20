import { useEffect, type ReactNode } from 'react';
import { CONSENT_CONFIRMATION, consentScript } from '../lib/consent';
import { PUBLIC_PATHS, type PublicPageName } from '../lib/publicPage';

export interface PublicPageProps {
  page: PublicPageName;
  /** Where to write with questions (CONTACT_EMAIL), or null when the owner hasn't set one. */
  contactEmail: string | null;
  /** Who runs the calendar (OWNER_NAME), or null when the owner hasn't set a name. */
  ownerName: string | null;
  /** No backend: the contact address shown is a sample. */
  sampleData?: boolean;
}

/** What the owner sets at deploy: where to write, and who runs the calendar. */
type OwnerDetails = Pick<PublicPageProps, 'contactEmail' | 'ownerName'>;

/** When the privacy policy and terms last changed. Change it whenever their words change. */
const LAST_UPDATED = '19 November 2026';

const FREQUENCY =
  'Message frequency varies with the number of appointments, typically between 2 and 10 messages a week.';

const TITLES: Record<PublicPageName, string> = {
  about: "About Susan's Calendar",
  privacy: 'Privacy Policy',
  terms: 'Terms and Conditions',
};

/** "run by …": who is behind the calendar and its texts. */
function runBy(ownerName: string | null) {
  return ownerName ? `run by ${ownerName}, a private individual,` : 'run by a private individual';
}

/** Who to ask: the contact address as a link, or the owner in words when none is set. */
function Contact({ contactEmail }: Pick<OwnerDetails, 'contactEmail'>) {
  if (!contactEmail) return <>the person who runs the calendar</>;
  return <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;
}

/** One clause of the policy or the terms: a bold lead-in, then its words. */
function Clause({ lead, children }: { lead: string; children: ReactNode }) {
  return (
    <p>
      <strong>{lead}</strong> {children}
    </p>
  );
}

function PrivacyPolicy({ contactEmail, ownerName }: OwnerDetails) {
  return (
    <>
      <p className="muted">Last updated {LAST_UPDATED}.</p>
      <p>
        This policy covers Susan's Calendar, a private appointment calendar {runBy(ownerName)} for
        one family.
      </p>
      <Clause lead="What is kept.">
        The mobile number of the one person who receives text messages, and the record of her
        consent: the date she agreed and how. The appointments entered in the calendar: what each
        one is, when and where it is, who it is with, who is driving, and notes. The name and email
        address of each person with an account. The text messages sent, whether each one was
        delivered, and any replies. The name and phone number of the person she is told to call for
        help.
      </Clause>
      <Clause lead="How it is used.">
        Only to keep the calendar, to send Susan the reminders she agreed to, and to tell the people
        who manage her calendar when a message did not arrive or she replied. Nothing is used for
        advertising or marketing, and no messages are sent to anyone else.
      </Clause>
      <Clause lead="Sharing.">
        Mobile numbers and consent to receive text messages are never sold, rented or shared with
        third parties or affiliates, for marketing or for any other purpose. The only companies that
        handle them are the ones that deliver the messages and host the calendar, Textbelt and
        Amazon Web Services, and they may use them only to do that. We do not sell or share SMS
        opt-in data or any other personal information with third parties for marketing purposes.
      </Clause>
      <Clause lead="Text messages.">
        {FREQUENCY} Message and data rates may apply. Reply STOP to stop the messages, or HELP for
        help. The <a href={PUBLIC_PATHS.terms}>Terms and Conditions</a> say more.
      </Clause>
      <Clause lead="Keeping and removing.">
        Information is kept for as long as the calendar is in use. Susan can stop the messages at
        any time by replying STOP. To see, correct or have deleted anything held about you, ask{' '}
        <Contact contactEmail={contactEmail} />.
      </Clause>
      <Clause lead="Security.">
        The calendar is not open to the public. Only people whose accounts were created by hand, for
        Susan and the people who manage her calendar, can sign in.
      </Clause>
      <Clause lead="Changes.">
        If this policy changes, the new version is published on this page with a new date.
      </Clause>
    </>
  );
}

function Terms({ contactEmail, ownerName }: OwnerDetails) {
  return (
    <>
      <p className="muted">Last updated {LAST_UPDATED}.</p>
      <p>
        These terms cover the text messages sent by Susan's Calendar, a private appointment calendar{' '}
        {runBy(ownerName)} for one family.
      </p>
      <Clause lead="The messages.">
        Susan's Calendar sends text message reminders of her own appointments to one person, Susan,
        and only after she has agreed to receive them: one message confirming that she agreed, a
        reminder before each appointment, a notice when an appointment she was already reminded of
        is moved or cancelled, an automatic answer if she replies, and now and then a test message.
        No advertising is ever sent, and nobody else receives messages.
      </Clause>
      <Clause lead="Agreeing.">
        Messages are sent only after she has said yes, in person, to the words shown on the{' '}
        <a href={PUBLIC_PATHS.about}>About page</a>. Agreeing is not a condition of anything.
      </Clause>
      <Clause lead="How often.">{FREQUENCY}</Clause>
      <Clause lead="Message and data rates may apply.">
        Susan's Calendar charges nothing for the messages. Her mobile phone company may, depending
        on her plan.
      </Clause>
      <Clause lead="Reply STOP to any message to stop all messages.">
        No more are sent after that. <strong>Reply START</strong> to turn them back on.
      </Clause>
      <Clause lead="Reply HELP to any message for help,">
        or ask <Contact contactEmail={contactEmail} />.
      </Clause>
      <Clause lead="Other replies.">
        Any other reply gets an automatic answer saying who to call, and is passed on to the people
        who manage her calendar. The calendar never acts on what a reply says.
      </Clause>
      <Clause lead="Delivery.">
        Carriers are not liable for delayed or undelivered messages. A message can be late or fail
        to arrive, so the reminders are a help and not a guarantee.
      </Clause>
      <Clause lead="Privacy.">
        The <a href={PUBLIC_PATHS.privacy}>Privacy Policy</a> says how mobile numbers and other
        information are handled.
      </Clause>
      <Clause lead="Changes.">
        If these terms change, the new version is published on this page with a new date.
      </Clause>
    </>
  );
}

function About({ contactEmail, ownerName }: OwnerDetails) {
  const script = consentScript(window.location.host);
  return (
    <>
      <h1>{TITLES.about}</h1>
      <p>
        Susan's Calendar is a private appointment calendar for one person, Susan. She and a few
        people who help her keep her appointments in it, and it sends her text message reminders so
        that she knows where she needs to be and who is taking her.
      </p>
      <p>
        It is {runBy(ownerName)} for one family. It is not a business, it sells nothing and it sends
        no advertising. Nobody can sign up: every account is created by hand for Susan or someone
        who helps her.
      </p>

      <section>
        <h2>Text messages</h2>
        <p>
          Text messages go to one person only, Susan, and only after she has agreed to receive them.
          They are:
        </p>
        <ul>
          <li>
            a reminder before each of her appointments, saying what it is, when and where it is, and
            who is driving her;
          </li>
          <li>a notice when an appointment she was already reminded of is moved or cancelled;</li>
          <li>an automatic answer if she replies, telling her who to call.</li>
        </ul>
        <p>
          {FREQUENCY} Message and data rates may apply. She can reply STOP at any time to stop the
          messages, or HELP for help. The full terms are further down this page.
        </p>
      </section>

      <section>
        <h2>How consent is given</h2>
        <p>
          No mobile number is collected on this website or by text message. Susan is asked in
          person, and answers for herself. {ownerName ?? 'The person who runs the calendar'} reads
          her these words:
        </p>
        <blockquote className="quoted">
          {script.ask.map((words) => (
            <p key={words}>{words}</p>
          ))}
        </blockquote>
        <p>If she agrees, she is told:</p>
        <blockquote className="quoted">
          <p>{script.afterYes}</p>
        </blockquote>
        <p>The date is written down, and one text message confirms it:</p>
        <blockquote className="quoted">
          <p>{CONSENT_CONFIRMATION}</p>
        </blockquote>
      </section>

      <section>
        <h2>Contact</h2>
        {contactEmail ? (
          <p>
            Questions about Susan's Calendar or its text messages:{' '}
            <Contact contactEmail={contactEmail} />
          </p>
        ) : (
          <p>A contact address has not been set for this site yet.</p>
        )}
      </section>

      <section>
        <h2>{TITLES.privacy}</h2>
        <PrivacyPolicy contactEmail={contactEmail} ownerName={ownerName} />
      </section>

      <section>
        <h2>{TITLES.terms}</h2>
        <Terms contactEmail={contactEmail} ownerName={ownerName} />
      </section>
    </>
  );
}

/**
 * The pages anyone can open without signing in: what Susan's Calendar is, its privacy policy and
 * its terms. About carries all three; the policy and the terms also have a page each, because the
 * consent script read to Susan gives an address for each. Links here are plain ones: these
 * pages sit outside the app's router (src/Root.tsx).
 */
export function PublicPage({ page, contactEmail, ownerName, sampleData }: PublicPageProps) {
  useEffect(() => {
    document.title = `${page === 'about' ? 'About' : TITLES[page]} · Susan's Calendar`;
  }, [page]);

  return (
    <div className="public">
      {sampleData && (
        <div className="notice" role="status">
          Sample data: the contact address here is not real.
        </div>
      )}
      <header className="public-head">
        <a className="brand" href={PUBLIC_PATHS.about}>
          <img src="/icons/favicon.svg" alt="" width={36} height={36} />
          Susan's Calendar
        </a>
      </header>
      <main className="page">
        {page === 'about' ? (
          <About contactEmail={contactEmail} ownerName={ownerName} />
        ) : (
          <>
            <h1>{TITLES[page]}</h1>
            {page === 'privacy' ? (
              <PrivacyPolicy contactEmail={contactEmail} ownerName={ownerName} />
            ) : (
              <Terms contactEmail={contactEmail} ownerName={ownerName} />
            )}
          </>
        )}
      </main>
      <footer className="public-foot">
        <nav aria-label="This site">
          <a href={PUBLIC_PATHS.about}>About</a>
          <a href={PUBLIC_PATHS.privacy}>{TITLES.privacy}</a>
          <a href={PUBLIC_PATHS.terms}>{TITLES.terms}</a>
          <a href="/">Sign in</a>
        </nav>
      </footer>
    </div>
  );
}
