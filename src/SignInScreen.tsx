// Loaded only when signed out, so the sign-in UI (the heaviest part of the bundle) and its styles
// stay off the normal launch path.
import { Authenticator, ThemeProvider, defaultDarkModeOverride } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { PUBLIC_PATHS } from './lib/publicPage';

const blueLight = {
  10: { value: '#e8eeff' },
  20: { value: '#c9d7ff' },
  40: { value: '#7f9df5' },
  60: { value: '#4a74ee' },
  80: { value: '#2f5fe8' },
  90: { value: '#244cc4' },
  100: { value: '#1b3a99' },
};

const blueDark = {
  10: { value: '#141c33' },
  20: { value: '#1c2a52' },
  40: { value: '#2a47a8' },
  60: { value: '#3566f0' },
  80: { value: '#5b85f7' },
  90: { value: '#7da2ff' },
  100: { value: '#a9c1ff' },
};

// Amplify's sign-in screen in the app's colours and type size (src/styles.css), light and dark.
const theme = {
  name: 'susans-calendar',
  tokens: {
    colors: { primary: blueLight },
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
          primary: blueDark,
          background: { primary: { value: '#131315' }, secondary: { value: '#1f1f23' } },
          border: { primary: { value: '#27272d' } },
          font: {
            primary: { value: '#f3f3f5' },
            secondary: { value: '#9d9da8' },
            interactive: { value: '#7da2ff' },
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
