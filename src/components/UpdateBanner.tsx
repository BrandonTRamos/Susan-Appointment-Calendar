import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * "A new version is available · Refresh". The service worker waits for this tap instead of swapping
 * the app out from under you. Checks for a deploy every 30 minutes and whenever the app is reopened.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update();
      };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  useEffect(() => {
    document.body.classList.toggle('has-update', needRefresh);
  }, [needRefresh]);

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version is available</span>
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        Refresh
      </button>
    </div>
  );
}
