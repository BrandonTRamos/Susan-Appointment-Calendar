// Line icons, drawn here so the app needs no icon library. All are decorative: the label beside
// each one carries the meaning.

import type { ReactNode } from 'react';

function Icon({ size = 26, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type Props = { size?: number };

export const UpcomingIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </Icon>
);

export const MonthIcon = (props: Props) => (
  <Icon {...props}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const PastIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.4" />
    <path d="M3.5 4v4.4h4.4M12 7.5V12l3 2" />
  </Icon>
);

export const RepliesIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M20.5 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4.3a8 8 0 1 1 15.1-4.2Z" />
  </Icon>
);

export const SettingsIcon = (props: Props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
  </Icon>
);

export const PlusIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
