import { useState } from 'react';

/** Signs out, and says so if it could not, so a borrowed device is never left open unnoticed. */
export function SignOut({ onSignOut }: { onSignOut: () => Promise<unknown> }) {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="sign-out">
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => {
          setFailed(false);
          setBusy(true);
          onSignOut()
            .catch(() => setFailed(true))
            .finally(() => setBusy(false));
        }}
      >
        Sign out
      </button>
      {failed && (
        <p className="error" role="alert">
          Could not sign out. Try again.
        </p>
      )}
    </div>
  );
}
