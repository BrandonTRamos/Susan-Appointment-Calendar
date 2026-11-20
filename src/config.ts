// The backend config comes from amplify_outputs.json, which `npx ampx sandbox` and Amplify Hosting
// generate. If it's missing, the app runs on sample data with nobody signed in.

import type { ResourcesConfig } from 'aws-amplify';
import { resolveContactEmail, resolveOwnerName } from './lib/publicPage';
import { resolveTimeZone } from './lib/timeZone';

type Outputs = ResourcesConfig & {
  custom?: {
    timeZone?: string;
    contactEmail?: string;
    ownerName?: string;
    subscriptionFeedUrl?: string;
    textSender?: string;
  };
};

const found = Object.values(
  import.meta.glob<Outputs>('../amplify_outputs.json', { eager: true, import: 'default' }),
)[0];

export const amplifyOutputs: Outputs | null = found ?? null;

/** Susan's time zone: the backend's SUSAN_TIME_ZONE (amplify/backend.ts), or US Eastern. */
export const timeZone = resolveTimeZone(found?.custom?.timeZone);

/**
 * The public pages' contact address: the backend's CONTACT_EMAIL, or null when it isn't set. On
 * sample data it is a sample address, so that the pages can be seen whole.
 */
export const contactEmail = found
  ? resolveContactEmail(found.custom?.contactEmail)
  : 'owner@example.com';

/** Who runs the calendar, as the public pages name them: the backend's OWNER_NAME, or null. */
export const ownerName = resolveOwnerName(found?.custom?.ownerName);

/** The calendar subscription feed's address (amplify/backend.ts), or null when the backend has none. */
export const subscriptionFeedUrl = found?.custom?.subscriptionFeedUrl || null;

/**
 * Whether the backend's texts are only recorded, by the stand-in sender, and reach no phone
 * (amplify/calendar/text-sender.ts). Ticket 13 adds the sender that really sends.
 */
export const textsRecordedOnly = (found?.custom?.textSender ?? 'stand-in') === 'stand-in';
