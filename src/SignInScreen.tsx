// Loaded only when signed out, so the sign-in UI (the heaviest part of the bundle) and its styles
// stay off the normal launch path.
import { Authenticator, ThemeProvider, defaultDarkModeOverride } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { PUBLIC_PATHS } from './lib/publicPage';

const tealLight = {
  10: { value: '#d5efeb' },
  20: { value: '#a7ded6' },
  40: { value: '#4fb3a6' },
  60: { value: '#14897f' },
  80: { value: '#0f766e' },
  90: { value: '#0b5f58' },
  100: { value: '#084c46' },
};

const tealDark = {
  10: { value: '#123a35' },
  20: { value: '#134e48' },
  40: { value: '#14897f' },
  60: { value: '#22b8a8' },
  80: { value: '#2dd4bf' },
  90: { value: '#5eead4' },
  100: { value: '#99f6e4' },
};

// Amplify's sign-in screen in the app's colours and type size (src/styles.css), light and dark.
const theme = {
  name: 'susans-calendar',
  tokens: {
    colors: { primary: tealLight },
    components: {
      button: { fontSize: { value: '1.125rem' } },
      fieldcontrol: { fontSize: { value: '1.125rem' } },
      field: { fontSize: { value: '1.125rem' } },
    },
  },
  overrides: [
    defaultDarkModeOverride,
    {
      colorMode: 'dark' as const,
      tokens: {
        colors: {
          primary: tealDark,
          background: { primary: { value: '#191e1c' }, secondary: { value: '#222826' } },
          border: { primary: { value: '#2e3633' } },
          font: {
            primary: { value: '#e6ebe8' },
            secondary: { value: '#9aa5a0' },
            interactive: { value: '#2dd4bf' },
          },
        },
      },
    },
  ],
};

const components = {
  Header() {
    return (
      <div className="auth-header">
        <img src="/icons/icon-192.png" alt="" width={72} height={72} />
        <h1>Susan's Calendar</h1>
      </div>
    );
  },
  // The public pages (src/routes/PublicPage.tsx). A plain link: they sit outside the app's router.
  Footer() {
    return (
      <p className="auth-footer">
        <a href={PUBLIC_PATHS.about}>About Susan's Calendar, privacy and terms</a>
      </p>
    );
  },
};

export default function SignInScreen() {
  return (
    <ThemeProvider theme={theme} colorMode="system">
      {/* Self sign-up is off in the backend, so there is no "Create account" tab. SignedIn swaps in the app. */}
      <Authenticator hideSignUp components={components}>
        {() => <></>}
      </Authenticator>
    </ThemeProvider>
  );
}
