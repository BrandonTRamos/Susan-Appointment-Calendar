// Today's date for Susan, kept current while a screen is open: it changes at her midnight, not the
// device's.

import { useCallback, useSyncExternalStore } from 'react';
import { today } from './localTime';

function subscribe(listener: () => void) {
  const timer = setInterval(listener, 60_000);
  document.addEventListener('visibilitychange', listener);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', listener);
  };
}

/** Today's date, 'YYYY-MM-DD', in a time zone. */
export function useToday(zone: string): string {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => today(zone, new Date()), [zone]),
  );
}
