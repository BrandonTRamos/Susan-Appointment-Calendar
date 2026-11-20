import { createContext, useContext } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { AppProps } from '../App';
import { useCalendar } from '../data/CalendarContext';
import { repliesNotSeen } from '../lib/calendar';
import { MonthIcon, PastIcon, PlusIcon, RepliesIcon, SettingsIcon, UpcomingIcon } from './Icons';
import { SignOut } from './SignOut';

/** Every tab and its URL. Past has no room in the phone's tab bar; its URL works at any width. */
const TABS = [
  { to: '/', label: 'Upcoming', Icon: UpcomingIcon, onPhone: true },
  { to: '/month', label: 'Month', Icon: MonthIcon, onPhone: true },
  { to: '/past', label: 'Past', Icon: PastIcon, onPhone: false },
  { to: '/replies', label: 'Replies', Icon: RepliesIcon, onPhone: true },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon, onPhone: true },
];

/**
 * The tab an Appointment was opened from, by its URL: where an Appointment's full screen goes back
 * to on a phone, and what stays in the middle column beside it on a desktop. Upcoming when the
 * Appointment's address was opened directly.
 */
export const PickedFrom = createContext('/');

/** Where an Appointment goes back to: the tab it was opened from. */
export function usePickedFrom(): { to: string; label: string } {
  const to = useContext(PickedFrom);
  const tab = TABS.find((each) => each.to === to) ?? TABS[0];
  return { to: tab.to, label: `Back to ${tab.label}` };
}

function Tabs({ phone = false }: { phone?: boolean }) {
  const { replies, repliesSeenUpTo } = useCalendar();
  // Only once both are read, so a count never flashes up before what was seen is known.
  const notSeen =
    replies && repliesSeenUpTo !== undefined ? repliesNotSeen(replies, repliesSeenUpTo) : 0;
  return (
    <nav aria-label="Main">
      {TABS.filter((tab) => !phone || tab.onPhone).map(({ to, label, Icon }) => {
        const count = to === '/replies' ? notSeen : 0;
        return (
          <NavLink key={to} to={to} end={to === '/'}>
            <span className="tab-icon">
              <Icon />
              {count > 0 && (
                <span className="tab-count" aria-hidden="true">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
            {label}
            {count > 0 && <span className="visually-hidden">{`, ${count} not yet seen`}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

/** The phone layout's bar of tabs along the bottom. */
export function TabBar() {
  return (
    <div className="tabbar">
      <Tabs phone />
    </div>
  );
}

/** The desktop layout's left column: app name, New Appointment, the tabs, and who is signed in. */
export function Sidebar({ displayName, onSignOut }: Pick<AppProps, 'displayName' | 'onSignOut'>) {
  return (
    <header className="sidebar">
      <div className="brand">
        <img src="/icons/favicon.svg" alt="" width={36} height={36} />
        Susan's Calendar
      </div>
      <Link className="btn btn-primary new-appointment" to="/appointments/new">
        <PlusIcon size={22} />
        New Appointment
      </Link>
      <Tabs />
      {(displayName || onSignOut) && (
        <div className="sidebar-foot">
          {displayName && <span className="person">{displayName}</span>}
          {onSignOut && <SignOut onSignOut={onSignOut} />}
        </div>
      )}
    </header>
  );
}
