import type { ReactNode } from 'react';

/** One screen: its heading, then whatever it shows. */
export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="page">
      <h1>{title}</h1>
      {children}
    </main>
  );
}

/** Stands in for a screen, or part of one, that a later ticket builds. */
export function Placeholder({ children }: { children: ReactNode }) {
  return <p className="placeholder">{children}</p>;
}
