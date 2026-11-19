// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignedIn } from './SignedIn';

const auth = vi.hoisted(() => ({
  session: vi.fn(),
  listener: undefined as
    undefined | ((event: { payload: { event: string; data?: unknown } }) => void),
}));
vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: auth.session }));
vi.mock('aws-amplify/utils', () => ({
  Hub: {
    listen: vi.fn((_channel, listener) => {
      auth.listener = listener;
      return () => {
        auth.listener = undefined;
      };
    }),
  },
}));
vi.mock('./SignInScreen', () => ({ default: () => <div>Sign-in screen</div> }));

const valid = (id = 'person-a', claims: Record<string, unknown> = { name: 'Alice' }) => ({
  userSub: id,
  tokens: { accessToken: { payload: { sub: id } }, idToken: { payload: { sub: id, ...claims } } },
});
const network = () =>
  Object.assign(new Error('Temporary connection problem'), { name: 'NetworkError' });
const emit = (event: string, data?: unknown) =>
  act(async () => auth.listener?.({ payload: { event, data } }));
const next = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  auth.session.mockReset().mockResolvedValue(valid());
});
afterEach(cleanup);

describe('SignedIn recovery', () => {
  it('offers retry instead of sign-in after a transient refresh failure and recovers on success', async () => {
    render(
      <SignedIn>
        <div>Private app</div>
      </SignedIn>,
    );
    expect(await screen.findByText('Private app')).toBeInTheDocument();
    await emit('tokenRefresh_failure', { error: network() });
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByText('Private app')).not.toBeVisible();
    expect(screen.queryByText('Sign-in screen')).not.toBeInTheDocument();
    await emit('tokenRefresh');
    expect(await screen.findByText('Private app')).toBeInTheDocument();
  });

  it('recovers from a temporary startup failure on foreground/online return and repeated retries', async () => {
    auth.session.mockRejectedValueOnce(network());
    render(
      <SignedIn>
        <div>Private app</div>
      </SignedIn>,
    );
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    fireEvent(window, new Event('online'));
    expect(await screen.findByText('Private app')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) {
      auth.session.mockRejectedValueOnce(network());
      fireEvent(window, new Event('online'));
      expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByText('Private app')).toBeInTheDocument();
    }
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const calls = auth.session.mock.calls.length;
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(auth.session.mock.calls.length).toBeGreaterThan(calls));
    expect(await screen.findByText('Private app')).toBeInTheDocument();
  });

  it.each([
    'NotAuthorizedException',
    'TokenRevokedException',
    'UserNotFoundException',
    'UserUnAuthenticatedException',
    'RefreshTokenReuseException',
  ])('keeps genuine invalid session %s signed out until a new sign-in', async (name) => {
    render(
      <SignedIn>
        <div>Private app</div>
      </SignedIn>,
    );
    await screen.findByText('Private app');
    await emit('tokenRefresh_failure', {
      error: Object.assign(new Error('Invalid session'), { name }),
    });
    expect(await screen.findByText('Sign-in screen')).toBeInTheDocument();
    await emit('tokenRefresh');
    fireEvent(window, new Event('online'));
    expect(screen.queryByText('Private app')).not.toBeInTheDocument();
    await emit('signedIn');
    expect(await screen.findByText('Private app')).toBeInTheDocument();
  });

  it('does not reopen a signed-out app from a stale startup result or refresh success', async () => {
    const pending = next<ReturnType<typeof valid>>();
    auth.session.mockReturnValue(pending.promise);
    render(
      <SignedIn>
        <div>Private app</div>
      </SignedIn>,
    );
    await emit('signedOut');
    await act(async () => pending.resolve(valid()));
    await emit('tokenRefresh');
    fireEvent(window, new Event('online'));
    expect(await screen.findByText('Sign-in screen')).toBeInTheDocument();
    expect(screen.queryByText('Private app')).not.toBeInTheDocument();
  });

  it('ignores an old startup rejection after a newer successful sign-in', async () => {
    const pending = next<ReturnType<typeof valid>>();
    auth.session.mockReturnValueOnce(pending.promise);
    render(
      <SignedIn>
        <div>Private app</div>
      </SignedIn>,
    );
    await emit('signedIn');
    expect(await screen.findByText('Private app')).toBeInTheDocument();
    await act(async () => pending.reject(network()));
    expect(screen.getByText('Private app')).toBeInTheDocument();
  });

  it('cancels abandoned strict-mode startup checks before they start', async () => {
    const pending = next<ReturnType<typeof valid>>();
    auth.session.mockReturnValueOnce(pending.promise);
    render(
      <StrictMode>
        <SignedIn>
          <div>Private app</div>
        </SignedIn>
      </StrictMode>,
    );
    await waitFor(() => expect(auth.session).toHaveBeenCalledTimes(1));
    await act(async () => pending.resolve(valid()));
    expect(await screen.findByText('Private app')).toBeInTheDocument();
  });

  it('shows sign-in for missing tokens and rejects mismatched identity snapshots', async () => {
    auth.session.mockResolvedValueOnce({});
    const view = render(
      <SignedIn>
        <div>Private app</div>
      </SignedIn>,
    );
    expect(await screen.findByText('Sign-in screen')).toBeInTheDocument();
    view.unmount();
    auth.session.mockResolvedValueOnce(valid('person-a', { sub: 'person-b', name: 'Bob' }));
    render(
      <SignedIn>
        <div>Private app</div>
      </SignedIn>,
    );
    expect(await screen.findByText('Sign-in screen')).toBeInTheDocument();
    expect(screen.queryByText('Private app')).not.toBeInTheDocument();
  });
});

describe('display name', () => {
  it.each([
    [{ sub: undefined, name: 'Alice' }, 'No name'],
    [{ name: '  Alice  ' }, 'Alice'],
    [{ name: 'Alice Example' }, 'Alice Example'],
    [{ name: '明子' }, '明子'],
    [{ email: 'private@example.test', 'cognito:username': 'private-id' }, 'No name'],
    [{ name: 'private@example.test' }, 'No name'],
    [{ name: 'person-a' }, 'No name'],
    [{ name: '12345678-1234-1234-1234-123456789abc' }, 'No name'],
    [{ name: '+1 555 123 4567' }, 'No name'],
    [{ name: 'https://example.test' }, 'No name'],
    [{ name: 'A'.repeat(200) }, 'No name'],
    [{ name: 42 }, 'No name'],
    [{ name: 'Alice\u0000' }, 'No name'],
  ])("uses only the account's display name, never an identifier %#", async (claims, expected) => {
    auth.session.mockResolvedValue(valid('person-a', claims));
    render(
      <SignedIn>
        {(person: { id: string; displayName: string | null }) => (
          <div>{person.displayName ?? 'No name'}</div>
        )}
      </SignedIn>,
    );
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.queryByText('private@example.test')).not.toBeInTheDocument();
  });

  it("never shows an earlier person's name after someone else signs in", async () => {
    const pending = next<ReturnType<typeof valid>>();
    auth.session.mockReturnValueOnce(pending.promise);
    render(
      <SignedIn>
        {(person: { id: string; displayName: string | null }) => (
          <div>{person.displayName ?? 'No name'}</div>
        )}
      </SignedIn>,
    );
    auth.session.mockResolvedValue(valid('person-b', { name: 'Bob' }));
    await emit('signedIn');
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    await act(async () => pending.resolve(valid()));
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    await emit('signedOut');
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });
});
