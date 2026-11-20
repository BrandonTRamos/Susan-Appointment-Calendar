import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import { UpdateBanner } from './components/UpdateBanner';
import {
  amplifyOutputs,
  contactEmail,
  ownerName,
  subscriptionFeedUrl,
  timeZone,
} from './config';
import { Root } from './Root';
import './styles.css';

if (amplifyOutputs) Amplify.configure(amplifyOutputs);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root
      backend={Boolean(amplifyOutputs)}
      timeZone={timeZone}
      contactEmail={contactEmail}
      ownerName={ownerName}
      subscriptionFeedUrl={subscriptionFeedUrl}
    />
    <UpdateBanner />
  </StrictMode>,
);
