// The calendar core's store, kept in the data API and reached with the function's own role.
//
// Writing through the data API, not straight to the tables, is what sends every change to the
// people looking at the calendar (docs/adr/0003-the-core-writes-through-the-data-api.md).

import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import {
  NO_SETTINGS,
  type Appointment,
  type Store,
  type SubscriptionLink,
  type Text,
} from '../../src/lib/calendar';
import {
  SETTINGS_ID,
  toAppointment,
  toSettings,
  toText,
  type AppointmentRow,
  type TextRow,
} from '../../src/lib/calendarApi';
import type { Schema } from '../data/resource';

type Models = ReturnType<typeof generateClient<Schema>>['models'];

/** The part of the data API the store uses. */
export interface DataClient {
  models: {
    Appointment: Pick<Models['Appointment'], 'get' | 'list' | 'create' | 'update' | 'delete'>;
    ActivityRecord: Pick<Models['ActivityRecord'], 'create'>;
    SubscriptionLink: Pick<
      Models['SubscriptionLink'],
      'get' | 'create' | 'update' | 'delete' | 'subscriptionLinkByHash'
    >;
    Text: Pick<Models['Text'], 'list' | 'create' | 'update' | 'textsByAppointment'>;
    CalendarSettings: Pick<Models['CalendarSettings'], 'get' | 'create' | 'update'>;
  };
}

interface DataError {
  message: string;
  errorType?: string | null;
}

function check<T>(result: { data: T; errors?: readonly DataError[] }): T {
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join('; '));
  return result.data;
}

/** Whether a create failed only because a row with its ID is already there. */
const alreadyThere = (errors: readonly DataError[] | undefined) =>
  Boolean(errors?.length) &&
  errors!.every((error) => /ConditionalCheckFailed/.test(error.errorType ?? error.message));

/** Every row of a model, page by page. */
async function everyRow<Row>(
  list: (options: { limit: number; nextToken?: string | null }) => Promise<{
    data: Row[];
    errors?: readonly DataError[];
    nextToken?: string | null;
  }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  let nextToken: string | null | undefined;
  do {
    const page = await list({ limit: 1000, nextToken });
    rows.push(...check(page));
    nextToken = page.nextToken;
  } while (nextToken);
  return rows;
}

/** Only the fields a subscription link has; the data API adds its own beside them. */
const toLink = ({ personId, hash, madeAt }: SubscriptionLink): SubscriptionLink => ({
  personId,
  hash,
  madeAt,
});

export function dataStore(client: DataClient): Store {
  const { Appointment, ActivityRecord, SubscriptionLink, Text, CalendarSettings } = client.models;
  /** Each Appointment as the core last read it here, until it is written. */
  const read = new Map<string, Appointment>();
  return {
    async appointment(id) {
      const row = check(await Appointment.get({ id }));
      const found = row ? toAppointment(row) : null;
      if (found) read.set(id, found);
      else read.delete(id);
      return found;
    },
    async addAppointment(appointment) {
      check(await Appointment.create(appointment));
    },
    // Only what differs from what the core read is written. The data API has no way to say "only
    // if nobody else has written since", so this is what keeps two commands that overlap from
    // undoing each other: a change does not write back a state or a detail it never touched.
    async replaceAppointment(appointment) {
      const was = read.get(appointment.id);
      read.delete(appointment.id);
      const differs = ([key, value]: [string, unknown]) =>
        !was || JSON.stringify(value) !== JSON.stringify(was[key as keyof Appointment]);
      const changed = Object.fromEntries(Object.entries(appointment).filter(differs));
      check(await Appointment.update({ ...changed, id: appointment.id }));
    },
    async removeAppointment(id) {
      read.delete(id);
      check(await Appointment.delete({ id }));
    },
    async textsAbout(appointmentId) {
      const rows = await everyRow<TextRow>((options) =>
        Text.textsByAppointment({ appointmentId }, options),
      );
      return rows.map(toText);
    },
    async everyText() {
      return (await everyRow<TextRow>((options) => Text.list(options))).map(toText);
    },
    // The data API creates a row only if none has its ID, in one step: the claim.
    async claimText(text) {
      const result = await Text.create(text);
      if (alreadyThere(result.errors)) return false;
      check(result);
      return true;
    },
    async replaceText(text: Text) {
      check(await Text.update(text));
    },
    async settings() {
      const row = check(await CalendarSettings.get({ id: SETTINGS_ID }));
      return row ? toSettings(row) : NO_SETTINGS;
    },
    async keepSettings(settings) {
      const had = check(await CalendarSettings.get({ id: SETTINGS_ID }));
      const row = { id: SETTINGS_ID, ...settings };
      check(await (had ? CalendarSettings.update(row) : CalendarSettings.create(row)));
    },
    async recordActivity(record) {
      check(await ActivityRecord.create(record));
    },
    async everyAppointment() {
      return (await everyRow<AppointmentRow>((options) => Appointment.list(options))).map(
        toAppointment,
      );
    },
    async subscriptionLinkOf(personId) {
      const row = check(await SubscriptionLink.get({ personId }));
      return row ? toLink(row) : null;
    },
    // The feed does not read through here: the data API's reads are not strongly consistent, so it
    // reads the tables itself (feed-store.ts). Found through an index, then checked against the
    // person's link.
    async subscriptionLinkByHash(hash) {
      const [found] = check(await SubscriptionLink.subscriptionLinkByHash({ hash }, { limit: 1 }));
      if (!found) return null;
      const row = check(await SubscriptionLink.get({ personId: found.personId }));
      return row && row.hash === hash ? toLink(row) : null;
    },
    async keepSubscriptionLink(link) {
      const had = check(await SubscriptionLink.get({ personId: link.personId }));
      check(await (had ? SubscriptionLink.update(link) : SubscriptionLink.create(link)));
    },
    async removeSubscriptionLink(personId) {
      check(await SubscriptionLink.delete({ personId }));
    },
  };
}

/**
 * The data API, for a backend function that the data schema lets call it. The Lambda runtime sets
 * the AWS credentials and AMPLIFY_DATA_* variables this reads.
 */
export async function connectDataApi(env: NodeJS.ProcessEnv = process.env) {
  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(
    env as Parameters<typeof getAmplifyDataClientConfig>[0],
  );
  Amplify.configure(resourceConfig, libraryOptions);
  return generateClient<Schema>();
}

/** The store for a backend function that the data schema lets call the data API. */
export async function createDataStore(env: NodeJS.ProcessEnv = process.env): Promise<Store> {
  return dataStore(await connectDataApi(env));
}
