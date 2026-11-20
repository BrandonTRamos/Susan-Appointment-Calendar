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
  type Series,
  type Store,
  type SubscriptionLink,
  type Text,
} from '../../src/lib/calendar';
import {
  SETTINGS_ID,
  toAppointment,
  toSeries,
  toSettings,
  textRow,
  toText,
  type AppointmentRow,
  type SeriesRow,
  type TextRow,
} from '../../src/lib/calendarApi';
import type { Schema } from '../data/resource';

type Models = ReturnType<typeof generateClient<Schema>>['models'];

/** The part of the data API the store uses. */
export interface DataClient {
  models: {
    Appointment: Pick<Models['Appointment'], 'get' | 'list' | 'create' | 'update' | 'delete'>;
    Series: Pick<Models['Series'], 'get' | 'list' | 'create' | 'update'>;
    ActivityRecord: Pick<Models['ActivityRecord'], 'create'>;
    SubscriptionLink: Pick<
      Models['SubscriptionLink'],
      'get' | 'create' | 'update' | 'delete' | 'subscriptionLinkByHash'
    >;
    Text: Pick<Models['Text'], 'list' | 'create' | 'update' | 'textsByAppointment'>;
    CalendarSettings: Pick<Models['CalendarSettings'], 'get' | 'create' | 'update'>;
  };
  /**
   * A raw data API operation, for a write that carries a condition: the models' own `update`
   * cannot, and the data API's can. The client throws the whole answer when it carries errors.
   */
  graphql(options: { query: string; variables: Record<string, unknown> }): Promise<unknown>;
}

/**
 * Replaces a text's record only if, as DynamoDB writes it, it is still as the condition says: the
 * data API adds `condition` to its own check that the row exists, in the one conditional write
 * (`npm run synth` checks that its resolver does).
 */
const CHANGE_TEXT = /* GraphQL */ `
  mutation ChangeText($input: UpdateTextInput!, $condition: ModelTextConditionInput!) {
    updateText(input: $input, condition: $condition) {
      id
    }
  }
`;

interface DataError {
  message: string;
  errorType?: string | null;
}

function check<T>(result: { data: T; errors?: readonly DataError[] }): T {
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join('; '));
  return result.data;
}

/**
 * Whether a write failed only because DynamoDB refused its condition: for a create, that a row
 * with its ID is already there; for a retake, that the row is no longer as it was read.
 */
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

/**
 * What differs between what was read and what is written, with the ID. The data API has no way to
 * say "only if nobody else has written since", so this is what keeps two writers that overlap from
 * undoing each other: a change does not write back a field it never touched.
 */
function differing<T extends { id: string }>(was: T | undefined, now: T) {
  const differs = ([key, value]: [string, unknown]) =>
    !was || JSON.stringify(value) !== JSON.stringify(was[key as keyof T]);
  return { ...Object.fromEntries(Object.entries(now).filter(differs)), id: now.id };
}

export function dataStore(client: DataClient): Store {
  const { Appointment, Series, ActivityRecord, SubscriptionLink, Text, CalendarSettings } =
    client.models;
  /** Each Appointment and Series as the core last read it here, until it is written. */
  const read = new Map<string, Appointment>();
  const readSeries = new Map<string, Series>();

  /** Replaces a text's record only if the condition holds as it is written. Answers whether it did. */
  async function changeTextIf(next: Text, condition: { and: Record<string, unknown>[] }) {
    let answer: { errors?: readonly DataError[] };
    try {
      answer = (await client.graphql({
        query: CHANGE_TEXT,
        variables: { input: textRow(next), condition },
      })) as { errors?: readonly DataError[] };
    } catch (thrown) {
      if (!(thrown && typeof thrown === 'object' && 'errors' in thrown)) throw thrown;
      answer = thrown as { errors?: readonly DataError[] };
    }
    if (!answer.errors?.length) return true;
    if (alreadyThere(answer.errors)) return false;
    throw new Error(answer.errors.map((e) => e.message).join('; '));
  }

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
    // Only what differs from what the core read is written (differing, above).
    async replaceAppointment(appointment) {
      const was = read.get(appointment.id);
      read.delete(appointment.id);
      check(await Appointment.update(differing(was, appointment)));
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
      const result = await Text.create(textRow(text));
      if (alreadyThere(result.errors)) return false;
      check(result);
      return true;
    },
    // Only if no other run has taken it up since it was read: still waiting, after the same tries.
    async retakeText(next, current) {
      return changeTextIf(next, {
        and: [
          { status: { eq: 'waiting' } },
          { attempts: { eq: current.attempts } },
          { triedAt: { eq: current.triedAt } },
        ],
      });
    },
    // Only if no other run has changed it since it was read: settled it, or taken up its Alert.
    async changeText(next, current) {
      return changeTextIf(next, {
        and: [
          { status: { eq: current.status } },
          { attempts: { eq: current.attempts } },
          { triedAt: { eq: current.triedAt } },
          ...(current.alert ? [{ alert: { eq: current.alert.state } }] : []),
          ...(current.alert?.triedAt ? [{ alertTriedAt: { eq: current.alert.triedAt } }] : []),
        ],
      });
    },
    async replaceText(text: Text) {
      check(await Text.update(textRow(text)));
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
      const all = (await everyRow<AppointmentRow>((options) => Appointment.list(options))).map(
        toAppointment,
      );
      for (const appointment of all) read.set(appointment.id, appointment);
      return all;
    },
    async series(id) {
      const row = check(await Series.get({ id }));
      const found = row ? toSeries(row) : null;
      if (found) readSeries.set(id, found);
      else readSeries.delete(id);
      return found;
    },
    async addSeries(series) {
      check(await Series.create(series));
    },
    async replaceSeries(series) {
      const was = readSeries.get(series.id);
      readSeries.delete(series.id);
      check(await Series.update(differing(was, series)));
    },
    async everySeries() {
      const all = (await everyRow<SeriesRow>((options) => Series.list(options))).map(toSeries);
      for (const series of all) readSeries.set(series.id, series);
      return all;
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
  // The data API's own client type is too deep to compare against the narrow one.
  return dataStore((await connectDataApi(env)) as unknown as DataClient);
}
