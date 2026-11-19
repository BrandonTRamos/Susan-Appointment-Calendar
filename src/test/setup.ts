import '@testing-library/jest-dom/vitest';

// jsdom has no matchMedia. Nothing matches, so screens render at phone width unless a test says
// otherwise (see `atWidth` in src/App.test.tsx).
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
}

// jsdom doesn't scroll; a new screen calls scrollTo to open at the top.
if (typeof window !== 'undefined') window.scrollTo = () => {};
