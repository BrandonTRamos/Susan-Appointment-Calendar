import { createContext, useContext, useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BackIcon } from './Icons';

/**
 * True inside the desktop layout's detail panel. A screen shown there is a part of the page, not
 * the page itself: its heading is one level down and it needs no way back.
 */
export const InPanel = createContext(false);

export function useInPanel(): boolean {
  return useContext(InPanel);
}

interface PageProps {
  title: string;
  /** A control beside the heading, such as New Appointment. */
  action?: ReactNode;
  /** Where a full screen on a phone goes back to. Not shown in the detail panel. */
  back?: { to: string; label: string };
  children: ReactNode;
}

/** One screen: its heading, then whatever it shows. In the detail panel, one part of the page. */
export function Page({ title, action, back, children }: PageProps) {
  const inPanel = useInPanel();
  const headingId = useId();
  const head = (
    <div className="page-head">
      {inPanel ? <h2 id={headingId}>{title}</h2> : <h1>{title}</h1>}
      {action}
    </div>
  );
  if (inPanel)
    return (
      <section className="page" aria-labelledby={headingId}>
        {head}
        {children}
      </section>
    );
  return (
    <main className="page">
      {back && (
        <Link className="back" to={back.to}>
          <BackIcon size={22} />
          {back.label}
        </Link>
      )}
      {head}
      {children}
    </main>
  );
}

/** Stands in for a screen, or part of one, that a later ticket builds. */
export function Placeholder({ children }: { children: ReactNode }) {
  return <p className="placeholder">{children}</p>;
}
