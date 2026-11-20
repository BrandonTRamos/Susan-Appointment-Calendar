import { useLayoutEffect, useRef } from 'react';
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
import { Sidebar, TabBar } from './components/Navigation';
import { InPanel, Placeholder } from './components/Page';
import { CalendarProvider, useCalendar } from './data/CalendarContext';
import type { CalendarClient } from './data/calendarClient';
import { forgetAtSignOut, type DeviceRegistry } from './lib/appNotifications';
import { upcomingAppointments } from './lib/calendar';
import { useDesktopWidth } from './lib/useDesktopWidth';
import { useKeepDeviceSaved } from './lib/useKeepDeviceSaved';
import { useToday } from './lib/useToday';
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
  /** Where this device is kept for app notifications. None on sample data. */
  devices?: DeviceRegistry | null;
  /** Missing when there is nobody to sign out (sample data). */
  onSignOut?: () => Promise<unknown>;
}

function Layout({
  displayName,
  sampleData,
  devices = null,
  onSignOut,
}: Omit<AppProps, 'calendar'>) {
  const desktop = useDesktopWidth();
  useKeepDeviceSaved(devices);
  // An Appointment's own addresses: on a phone a full screen, on a desktop the detail panel.
  const onAppointment = useMatch('/appointments/*') !== null;
  const panel = useRef<HTMLElement>(null);

  // A new screen opens at the top; Back (a POP) returns to where you were. On a desktop the
  // middle column keeps its place while only the detail panel changes.
  const { pathname } = useLocation();
  const navigation = useNavigationType();
  const middle = desktop && onAppointment ? '/' : pathname;
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
      <div className={onAppointment ? 'app phone full-screen' : 'app phone'}>
        {notice}
        <Outlet />
        {!onAppointment && <TabBar />}
      </div>
    );
  return (
    <div className="app desktop">
      <Sidebar displayName={displayName} onSignOut={onSignOut} />
      <div className="middle">
        {notice}
        {/* An Appointment opens beside the list it was picked from. */}
        {onAppointment ? <Upcoming /> : <Outlet />}
      </div>
      <aside className="detail" aria-label="Appointment details" ref={panel}>
        <InPanel.Provider value={true}>
          {onAppointment ? <Outlet /> : <PickedToBeginWith />}
        </InPanel.Provider>
      </aside>
    </div>
  );
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

export function App({ calendar, onSignOut, ...rest }: AppProps) {
  // Signing out turns app notifications off for this device first, while there is still someone
  // signed in to forget it for.
  const props = {
    ...rest,
    onSignOut:
      onSignOut &&
      (async () => {
        await forgetAtSignOut(rest.devices ?? null);
        return onSignOut();
      }),
  };
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
