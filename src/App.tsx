import { useLayoutEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useMatch,
  useNavigationType,
} from 'react-router-dom';
import { PickedFrom, Sidebar, TabBar } from './components/Navigation';
import { InPanel, Placeholder } from './components/Page';
import { CalendarProvider, useCalendar } from './data/CalendarContext';
import type { CalendarClient } from './data/calendarClient';
import { upcomingAppointments } from './lib/calendar';
import { useDesktopWidth } from './lib/useDesktopWidth';
import { useToday } from './lib/useToday';
import { AppointmentDetail } from './routes/AppointmentDetail';
import { EditAppointment, NewAppointment } from './routes/AppointmentForm';
import { Month, MonthPlace } from './routes/Month';
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

function Layout(props: Omit<AppProps, 'calendar'>) {
  const { displayName, sampleData, onSignOut } = props;
  const desktop = useDesktopWidth();
  // An Appointment's own addresses: on a phone a full screen, on a desktop the detail panel.
  const onAppointment = useMatch('/appointments/*') !== null;
  const panel = useRef<HTMLElement>(null);

  // The tab an Appointment was opened from: kept while it, its form, or another one picked beside
  // it is open.
  const { pathname } = useLocation();
  const [pickedFrom, setPickedFrom] = useState(onAppointment ? '/' : pathname);
  if (!onAppointment && pickedFrom !== pathname) setPickedFrom(pathname);

  // A new screen opens at the top; Back (a POP) returns to where you were. On a desktop the
  // middle column keeps its place while only the detail panel changes.
  const navigation = useNavigationType();
  const middle = desktop && onAppointment ? pickedFrom : pathname;
  useLayoutEffect(() => {
    if (navigation !== 'POP') window.scrollTo(0, 0);
  }, [middle, navigation]);
  useLayoutEffect(() => {
    panel.current?.scrollTo?.(0, 0);
  }, [pathname]);

  const notice = sampleData && (
    <div className="notice" role="status">
      Sample data: nothing here is real, and nothing is saved.
    </div>
  );

  if (!desktop)
    return (
      <PickedFrom.Provider value={pickedFrom}>
        <div className={onAppointment ? 'app phone full-screen' : 'app phone'}>
          {notice}
          <Outlet />
          {!onAppointment && <TabBar />}
        </div>
      </PickedFrom.Provider>
    );
  return (
    <PickedFrom.Provider value={pickedFrom}>
      <div className="app desktop">
        <Sidebar displayName={displayName} onSignOut={onSignOut} />
        <div className="middle">
          {notice}
          {/* An Appointment opens beside the tab it was picked from. */}
          {onAppointment ? <Tab path={pickedFrom} {...props} /> : <Outlet />}
        </div>
        <aside className="detail" aria-label="Appointment details" ref={panel}>
          <InPanel.Provider value={true}>
            {onAppointment ? <Outlet /> : <PickedToBeginWith />}
          </InPanel.Provider>
        </aside>
      </div>
    </PickedFrom.Provider>
  );
}

/** A tab's screen, by its URL: what the middle column holds while an Appointment is open. */
function Tab({ path, ...props }: Omit<AppProps, 'calendar'> & { path: string }) {
  switch (path) {
    case '/month':
      return <Month />;
    case '/past':
      return <Past />;
    case '/replies':
      return <Replies />;
    case '/settings':
      return <Settings {...props} />;
    default:
      return <Upcoming />;
  }
}

/** The detail panel before anything is picked: on Upcoming, the next Appointment. */
function PickedToBeginWith() {
  const onUpcoming = useMatch('/') !== null;
  const { appointments, timeZone } = useCalendar();
  const today = useToday(timeZone);
  const next = onUpcoming && appointments ? upcomingAppointments(appointments, today)[0] : null;
  if (next) return <AppointmentDetail id={next.id} />;
  return <Placeholder>Pick an Appointment to see it here.</Placeholder>;
}

export function App({ calendar, ...props }: AppProps) {
  return (
    <CalendarProvider client={calendar} timeZone={props.timeZone}>
      <BrowserRouter>
        <Routes>
          <Route
            element={
              <MonthPlace>
                <Layout {...props} />
              </MonthPlace>
            }
          >
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
