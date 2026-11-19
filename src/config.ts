// The backend config comes from amplify_outputs.json, which `npx ampx sandbox` and Amplify Hosting
// generate. If it's missing, the app runs on sample data with nobody signed in.

import type { ResourcesConfig } from 'aws-amplify';
import { resolveTimeZone } from './lib/timeZone';

type Outputs = ResourcesConfig & { custom?: { timeZone?: string } };

const found = Object.values(
  import.meta.glob<Outputs>('../amplify_outputs.json', { eager: true, import: 'default' }),
)[0];

export const amplifyOutputs: Outputs | null = found ?? null;

/** Susan's time zone: the backend's SUSAN_TIME_ZONE (amplify/backend.ts), or US Eastern. */
export const timeZone = resolveTimeZone(found?.custom?.timeZone);
