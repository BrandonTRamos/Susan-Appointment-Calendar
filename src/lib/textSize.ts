// How large the words and controls are on this device: the usual size, or larger (Settings → Text
// size). It is kept in this browser only, like the device's own text size, and shown by an
// attribute on the page's root that src/styles.css follows.

export type TextSize = 'standard' | 'larger';

const KEY = 'susans-calendar:text-size';

/** The size chosen on this device, or the usual size when none was chosen or it cannot be read. */
export function savedTextSize(): TextSize {
  try {
    return localStorage.getItem(KEY) === 'larger' ? 'larger' : 'standard';
  } catch {
    return 'standard';
  }
}

/** Shows the page at a size. */
export function showTextSize(size: TextSize) {
  const root = document.documentElement;
  if (size === 'larger') root.dataset.textSize = 'larger';
  else delete root.dataset.textSize;
}

/** Shows the page at a size and keeps it for the next time the app is opened on this device. */
export function chooseTextSize(size: TextSize) {
  showTextSize(size);
  try {
    if (size === 'larger') localStorage.setItem(KEY, 'larger');
    else localStorage.removeItem(KEY);
  } catch {
    // Storage is blocked here: the size holds until the page is closed.
  }
}
