// A counter that goes up whenever the app comes back to the foreground or back online. iOS suspends
// home-screen apps, so data loaded before the suspension (or before midnight) can be stale on return.

import { useSyncExternalStore } from 'react';

let count = 0;
const listeners = new Set<() => void>();

function bump() {
  count++;
  for (const l of listeners) l();
}

function onVisibility() {
  if (document.visibilityState === 'visible') bump();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', bump);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', bump);
    }
  };
}

export function useResumeCount(): number {
  return useSyncExternalStore(subscribe, () => count);
}

/** The count right now, for code outside React (e.g. the store's cache). */
export const resumeCount = () => count;
