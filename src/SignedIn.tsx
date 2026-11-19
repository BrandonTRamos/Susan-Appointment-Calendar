import { fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import {
  Activity,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useResumeCount } from './lib/resume';
import { invalidSession, signedInPerson, type SignedInPerson } from './lib/session';

const SignInScreen = lazy(() => import('./SignInScreen'));
type State = { status: 'checking' | 'retry' | 'out' | 'in'; person: SignedInPerson | null };

/**
 * Shows the app only to a signed-in person, and the sign-in screen to anyone else. A temporary
 * connection failure offers Retry and never signs the person out.
 */
export function SignedIn({
  children,
}: {
  children: ReactNode | ((person: SignedInPerson) => ReactNode);
}) {
  const [state, setState] = useState<State>({ status: 'checking', person: null });
  const revision = useRef(0);
  const active = useRef(false);
  const invalidate = useCallback(() => {
    revision.current++;
  }, []);
  // A late refresh or foreground event must never undo a real sign-out or invalid session.
  const signedOut = useRef(false);
  const resumed = useResumeCount();

  const check = useCallback(async () => {
    if (!active.current || signedOut.current) return;
    const request = ++revision.current;
    const current = () => active.current && revision.current === request && !signedOut.current;
    setState((previous) => ({ ...previous, status: 'checking' }));
    try {
      const snapshot = await fetchAuthSession();
      if (!current()) return;
      const person = signedInPerson(snapshot);
      if (person) setState({ status: 'in', person });
      else {
        signedOut.current = true;
        setState({ status: 'out', person: null });
      }
    } catch (error) {
      if (!current()) return;
      if (invalidSession(error)) {
        signedOut.current = true;
        setState({ status: 'out', person: null });
      } else setState((previous) => ({ ...previous, status: 'retry' }));
    }
  }, []);

  useEffect(() => {
    active.current = true;
    const stop = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedOut') {
        invalidate();
        signedOut.current = true;
        setState({ status: 'out', person: null });
      } else if (payload.event === 'signedIn') {
        signedOut.current = false;
        setState({ status: 'checking', person: null });
        void check();
      } else if (payload.event === 'tokenRefresh') {
        void check();
      } else if (payload.event === 'tokenRefresh_failure' && !signedOut.current) {
        invalidate();
        if (invalidSession(payload.data?.error)) {
          signedOut.current = true;
          setState({ status: 'out', person: null });
        } else setState((previous) => ({ ...previous, status: 'retry' }));
      }
    });
    return () => {
      active.current = false;
      invalidate();
      stop();
    };
  }, [check, invalidate]);

  useEffect(() => {
    // Start the external auth read after this effect; cancel queued work on cleanup/StrictMode.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void check();
    });
    return () => {
      cancelled = true;
    };
  }, [check, resumed]);

  return (
    <>
      {state.person && (
        <Activity key={state.person.id} mode={state.status === 'in' ? 'visible' : 'hidden'}>
          {typeof children === 'function' ? children(state.person) : children}
        </Activity>
      )}
      {state.status === 'checking' && (
        <main className="page">
          <p className="spinner" role="status">
            Checking your session…
          </p>
        </main>
      )}
      {state.status === 'retry' && (
        <main className="page">
          <div className="card">
            <h1>Reconnect</h1>
            <p role="status">
              We couldn’t check your session. Check your connection, then try again.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => void check()}>
              Retry
            </button>
          </div>
        </main>
      )}
      {state.status === 'out' && (
        <Suspense fallback={null}>
          <SignInScreen />
        </Suspense>
      )}
    </>
  );
}
