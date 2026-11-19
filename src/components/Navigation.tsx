import { Link, NavLink } from 'react-router-dom';
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

function Tabs({ phone = false }: { phone?: boolean }) {
  return (
    <nav aria-label="Main">
      {TABS.filter((tab) => !phone || tab.onPhone).map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} end={to === '/'}>
          <Icon />
          {label}
        </NavLink>
      ))}
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
export function Sidebar({
  displayName,
  onSignOut,
}: {
  displayName: string | null;
  onSignOut?: () => Promise<unknown>;
}) {
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
