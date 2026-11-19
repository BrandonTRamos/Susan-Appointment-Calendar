// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CONSENT_CONFIRMATION } from '../lib/consent';
import type { PublicPageName } from '../lib/publicPage';
import { PublicPage } from './PublicPage';

function renderPage(page: PublicPageName, props: Partial<Parameters<typeof PublicPage>[0]> = {}) {
  return render(
    <PublicPage page={page} contactEmail="owner@example.com" ownerName={null} {...props} />,
  );
}

/** The part of the page under a heading: its section. */
const section = (name: string | RegExp) =>
  within(screen.getByRole('heading', { name }).closest('section')!);

afterEach(cleanup);

describe('the About page', () => {
  it('says what the service is: appointment reminders by text to one family member who agreed', () => {
    renderPage('about');
    expect(
      screen.getByRole('heading', { level: 1, name: "About Susan's Calendar" }),
    ).toBeInTheDocument();
    const about = screen.getByRole('main');
    expect(about).toHaveTextContent(/private appointment calendar/);
    expect(about).toHaveTextContent(/text message reminders/i);
    expect(about).toHaveTextContent(/one person/);
    expect(about).toHaveTextContent(/agreed/);
    expect(about).toHaveTextContent(/no advertising/i);
  });

  it('gives the contact email address the owner set', () => {
    renderPage('about', { contactEmail: 'someone@example.org' });
    const links = screen.getAllByRole('link', { name: 'someone@example.org' });
    expect(links[0]).toHaveAttribute('href', 'mailto:someone@example.org');
    expect(section('Contact').getByRole('link', { name: 'someone@example.org' })).toBeVisible();
  });

  it('says so when no contact address has been set', () => {
    renderPage('about', { contactEmail: null });
    expect(section('Contact').getByText(/has not been set/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument();
  });

  it('names who runs it when the owner set a name, and nobody otherwise', () => {
    renderPage('about', { ownerName: 'Linda Example' });
    expect(screen.getByRole('main')).toHaveTextContent(
      /run by Linda Example, a private individual/,
    );
    cleanup();
    renderPage('about');
    expect(screen.getByRole('main')).toHaveTextContent(/run by a private individual/);
  });

  it('carries the privacy policy and the terms in full', () => {
    renderPage('about');
    expect(screen.getByRole('heading', { level: 2, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Terms and Conditions' }),
    ).toBeInTheDocument();
    expect(section('Privacy Policy').getByText(/never sold, rented or shared/)).toBeInTheDocument();
    expect(
      section('Terms and Conditions').getByText('Message and data rates may apply.'),
    ).toBeInTheDocument();
  });

  it('shows the words read aloud to ask for consent, and the text that confirms it', () => {
    renderPage('about');
    const consent = section('How consent is given');
    expect(consent.getByText(/Do you agree to get these text reminders/)).toBeInTheDocument();
    expect(consent.getByText(/yes or no/)).toBeInTheDocument();
    expect(consent.getByText(CONSENT_CONFIRMATION)).toBeInTheDocument();
    // The script gives the addresses of the terms and the privacy policy on this site.
    expect(consent.getByText(new RegExp(`${window.location.host}/terms`))).toBeInTheDocument();
    expect(consent.getByText(new RegExp(`${window.location.host}/privacy`))).toBeInTheDocument();
  });
});

describe('the privacy policy', () => {
  it('has its own page, titled Privacy Policy', () => {
    renderPage('privacy');
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(document.title).toBe("Privacy Policy · Susan's Calendar");
    expect(screen.queryByRole('heading', { name: 'Terms and Conditions' })).not.toBeInTheDocument();
  });

  it('states that mobile numbers and consent are never shared with third parties', () => {
    renderPage('privacy');
    const policy = screen.getByRole('main');
    expect(policy).toHaveTextContent(
      /Mobile numbers and consent to receive text messages are never sold, rented or shared with third parties or affiliates, for marketing or for any other purpose\./,
    );
    // The companies that carry the texts are named, not hidden behind "never".
    expect(policy).toHaveTextContent(/Twilio/);
    expect(policy).toHaveTextContent(/only to do that/);
  });

  it('says what is kept, how to have it removed, and who to ask', () => {
    renderPage('privacy', { ownerName: 'Linda Example' });
    const policy = screen.getByRole('main');
    expect(policy).toHaveTextContent(/mobile number/);
    expect(policy).toHaveTextContent(/date/);
    expect(policy).toHaveTextContent(/deleted/);
    expect(policy).toHaveTextContent(/Linda Example/);
    expect(screen.getAllByRole('link', { name: 'owner@example.com' }).length).toBeGreaterThan(0);
  });
});

describe('the terms', () => {
  it('have their own page, titled Terms and Conditions', () => {
    renderPage('terms');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms and Conditions' }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Terms and Conditions · Susan's Calendar");
    expect(screen.queryByRole('heading', { name: 'Privacy Policy' })).not.toBeInTheDocument();
  });

  it('cover what messages are sent and roughly how often', () => {
    renderPage('terms');
    const terms = screen.getByRole('main');
    expect(terms).toHaveTextContent(/reminders of her own appointments/i);
    expect(terms).toHaveTextContent(/only after she has agreed/);
    expect(terms).toHaveTextContent(/confirming that she agreed/);
    expect(terms).toHaveTextContent(/moved or cancelled/);
    expect(terms).toHaveTextContent(/Message frequency varies/);
    expect(terms).toHaveTextContent(/between 2 and 10 messages a week/);
  });

  it('say "Message and data rates may apply"', () => {
    renderPage('terms');
    expect(screen.getByText('Message and data rates may apply.')).toBeInTheDocument();
  });

  it('say how STOP and HELP work, in bold', () => {
    renderPage('terms');
    const terms = screen.getByRole('main');
    expect(terms).toHaveTextContent(/Reply STOP to any message to stop all messages/);
    expect(terms).toHaveTextContent(/Reply START/);
    expect(terms).toHaveTextContent(/Reply HELP to any message for help/);
    expect(screen.getByText(/Reply STOP to any message/).tagName).toBe('STRONG');
    expect(screen.getByText(/Reply HELP to any message/).tagName).toBe('STRONG');
  });

  it('say that carriers are not liable for late or undelivered messages, and link to the privacy policy', () => {
    renderPage('terms');
    const terms = within(screen.getByRole('main'));
    expect(terms.getByText(/Carriers are not liable/)).toBeInTheDocument();
    expect(terms.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });
});

describe('every public page', () => {
  it.each(['about', 'privacy', 'terms'] as const)(
    '%s links to the others and to sign-in',
    (page) => {
      renderPage(page);
      const links = within(screen.getByRole('navigation', { name: 'This site' }));
      expect(links.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
      expect(links.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
        'href',
        '/privacy',
      );
      expect(links.getByRole('link', { name: 'Terms and Conditions' })).toHaveAttribute(
        'href',
        '/terms',
      );
      expect(links.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/');
    },
  );

  it('says when it was last updated', () => {
    renderPage('privacy');
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
  });

  it('says so when the app is on sample data', () => {
    renderPage('about', { sampleData: true });
    expect(screen.getByRole('status')).toHaveTextContent(/Sample data/);
    cleanup();
    renderPage('about');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
