import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import { signOut } from 'aws-amplify/auth';
import { App } from './App';
import { UpdateBanner } from './components/UpdateBanner';
import { amplifyOutputs, timeZone } from './config';
import { SignedIn } from './SignedIn';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

if (amplifyOutputs) {
  Amplify.configure(amplifyOutputs);
  root.render(
    <StrictMode>
      <SignedIn>
        {(person) => (
          <App displayName={person.displayName} timeZone={timeZone} onSignOut={() => signOut()} />
        )}
      </SignedIn>
      <UpdateBanner />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App displayName={null} timeZone={timeZone} sampleData />
      <UpdateBanner />
    </StrictMode>,
  );
}
