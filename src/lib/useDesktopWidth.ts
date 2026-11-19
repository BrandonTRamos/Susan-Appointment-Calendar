// The app has two layouts: a phone layout with a bottom tab bar, and a desktop layout with a
// sidebar and three columns. This is the one place that decides which is showing.

import { useSyncExternalStore } from 'react';

/** At this width and wider the desktop layout shows. src/styles.css has no width queries of its own. */
export const DESKTOP_WIDTH = '(min-width: 1024px)';

function subscribe(listener: () => void) {
  const media = window.matchMedia(DESKTOP_WIDTH);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

export function useDesktopWidth(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_WIDTH).matches);
}
