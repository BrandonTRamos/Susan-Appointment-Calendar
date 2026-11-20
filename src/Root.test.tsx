// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Root } from './Root';

const auth = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: auth.session, signOut: vi.fn() }));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn(() => () => {}) } }));
vi.mock('./SignInScreen', () => ({ default: () => <div>Sign-in screen</div> }));
// The data API is stood in for by an empty calendar kept in memory.
vi.mock('./data/amplifyCalendar', async () => {
  const { createSampleCalendar } = await import('./data/sampleCalendar');
  return { createAmplifyCalendar: () => createSampleCalendar('America/New_York', { empty: true }) };
});

const signedIn = {
  userSub: 'person-a',
  tokens: {
    accessToken: { payload: { sub: 'person-a' } },
    idToken: { payload: { sub: 'person-a', name: 'Linda' } },
  },
};

function renderRoot(path: string, props: Partial<Parameters<typeof Root>[0]> = {}) {
  window.history.pushState({}, '', path);
  return render(
    <Root
      backend
      timeZone="America/New_York"
      contactEmail="owner@example.com"
      ownerName={null}
      {...props}
    />,
  );
}

/** The session check starts a moment after the first render (src/SignedIn.tsx); wait past it. */
const settled = () => act(async () => {});

beforeEach(() => {
  // Nobody is signed in unless a test says otherwise.
  auth.session.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

describe('without signing in', () => {
  it.each([
    ['/about', "About Susan's Calendar"],
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms and Conditions'],
  ])('%s opens for anyone, and no session is looked for', async (path, heading) => {
    renderRoot(path);
    await settled();
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'owner@example.com' })[0]).toBeInTheDocument();
    expect(auth.session).not.toHaveBeenCalled();
    expect(screen.queryByText('Sign-in screen')).not.toBeInTheDocument();
  });

  it('every other address shows the sign-in screen', async () => {
    renderRoot('/month');
    expect(await screen.findByText('Sign-in screen')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Month' })).not.toBeInTheDocument();
  });
});

describe('signed in', () => {
  beforeEach(() => auth.session.mockResolvedValue(signedIn));

  it('opens the calendar, read from the data API and not from sample data', async () => {
    renderRoot('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Upcoming' })).toBeInTheDocument();
    expect(await screen.findByText('No upcoming Appointments.')).toBeInTheDocument();
    expect(screen.queryByText(/Sample data/)).not.toBeInTheDocument();
  });

  it('still shows the public page at its address', () => {
    renderRoot('/about');
    expect(
      screen.getByRole('heading', { level: 1, name: "About Susan's Calendar" }),
    ).toBeInTheDocument();
  });
});

describe('with no backend', () => {
  it('runs the calendar on sample data with nobody signed in', async () => {
    renderRoot('/', { backend: false });
    await settled();
    expect(screen.getByRole('heading', { level: 1, name: 'Upcoming' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Sample data/);
    expect(screen.getByRole('link', { name: /Cardiology check-up/ })).toBeInTheDocument();
    expect(auth.session).not.toHaveBeenCalled();
  });

  it('shows the public page, marked as sample data', () => {
    renderRoot('/about', { backend: false });
    expect(
      screen.getByRole('heading', { level: 1, name: "About Susan's Calendar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Sample data/);
  });
});
