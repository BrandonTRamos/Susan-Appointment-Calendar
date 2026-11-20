import { useLayoutEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { Sidebar, TabBar } from './components/Navigation';
import { Placeholder } from './components/Page';
import { CalendarProvider } from './data/CalendarContext';
import type { CalendarClient } from './data/calendarClient';
import { useDesktopWidth } from './lib/useDesktopWidth';
import { AppointmentDetail } from './routes/AppointmentDetail';
import { EditAppointment, NewAppointment } from './routes/AppointmentForm';
import { Month } from './routes/Month';
import { Past } from './routes/Past';
import { Replies } from './routes/Replies';
import { Settings } from './routes/Settings';
import { Upcoming } from './routes/Upcoming';

export interface AppProps {
  /** The signed-in person's name, or null if their account has none. */
  displayName: string | null;
  /** Susan's time zone (src/lib/timeZone.ts). */
  timeZone: string;
  /** Reads the calendar and carries out its commands: the data API's, or sample data's. */
  calendar: CalendarClient;
  /** No backend: the app shows sample data and nobody is signed in. */
  sampleData?: boolean;
  /** Missing when there is nobody to sign out (sample data). */
  onSignOut?: () => Promise<unknown>;
}

function Layout({ displayName, sampleData, onSignOut }: Omit<AppProps, 'calendar'>) {
  const desktop = useDesktopWidth();
  // A new screen opens at the top; Back (a POP) returns to where you were.
  const { pathname } = useLocation();
  const navigation = useNavigationType();
  useLayoutEffect(() => {
    if (navigation !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navigation]);

  const notice = sampleData && (
    <div className="notice" role="status">
      Sample data: nothing here is real, and nothing is saved.
    </div>
  );

  if (!desktop)
    return (
      <div className="app phone">
        {notice}
        <Outlet />
        <TabBar />
      </div>
    );
  return (
    <div className="app desktop">
      <Sidebar displayName={displayName} onSignOut={onSignOut} />
      <div className="middle">
        {notice}
        <Outlet />
      </div>
      <aside className="detail" aria-label="Appointment details">
        <Placeholder>The picked Appointment's details will show here.</Placeholder>
      </aside>
    </div>
  );
}

export function App({ calendar, ...props }: AppProps) {
  return (
    <CalendarProvider client={calendar} timeZone={props.timeZone}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout {...props} />}>
            <Route index element={<Upcoming />} />
            <Route path="month" element={<Month />} />
            <Route path="past" element={<Past />} />
            <Route path="replies" element={<Replies />} />
            <Route path="settings" element={<Settings {...props} />} />
            <Route path="appointments/new" element={<NewAppointment />} />
            <Route path="appointments/:id" element={<AppointmentDetail />} />
            <Route path="appointments/:id/edit" element={<EditAppointment />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </CalendarProvider>
  );
}
