import type { ReactNode } from 'react';

/** One titled part of Settings. Each part lives in its own file so they can be built separately. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card settings-section" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
