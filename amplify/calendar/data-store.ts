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
  calendarAlertRow,
  replyRow,
  SETTINGS_ID,
  toAgentKey,
  toAppointment,
  toCalendarAlert,
  toReply,
  toSeries,
  toSettings,
  textRow,
  toText,
  type AppointmentRow,
  type CalendarAlertRow,
  type ReplyRow,
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
    AgentKey: Pick<Models['AgentKey'], 'get' | 'create'>;
    Text: Pick<Models['Text'], 'list' | 'create' | 'update' | 'textsByAppointment'>;
    CalendarSettings: Pick<Models['CalendarSettings'], 'get' | 'create' | 'update'>;
    Reply: Pick<Models['Reply'], 'list' | 'create'>;
    CalendarAlert: Pick<Models['CalendarAlert'], 'list' | 'create'>;
    RepliesSeen: Pick<Models['RepliesSeen'], 'get' | 'create'>;
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

/** The same, for a Reply: its answer and its passing on are changed only as `changeText`. */
const CHANGE_REPLY = /* GraphQL */ `
  mutation ChangeReply($input: UpdateReplyInput!, $condition: ModelReplyConditionInput!) {
    updateReply(input: $input, condition: $condition) {
      id
    }
  }
`;

/** Moves a person's mark of the Replies they have seen on, only if it is still earlier. */
const ADVANCE_REPLIES_SEEN = /* GraphQL */ `
  mutation AdvanceRepliesSeen(
    $input: UpdateRepliesSeenInput!
    $condition: ModelRepliesSeenConditionInput!
  ) {
    updateRepliesSeen(input: $input, condition: $condition) {
      personId
    }
  }
`;

/** The same, for a calendar Alert's sending. */
const CHANGE_CALENDAR_ALERT = /* GraphQL */ `
  mutation ChangeCalendarAlert(
    $input: UpdateCalendarAlertInput!
    $condition: ModelCalendarAlertConditionInput!
  ) {
    updateCalendarAlert(input: $input, condition: $condition) {
      id
    }
  }
`;

/**
 * Revokes an agent key only if, as DynamoDB deletes it, it is the person's: the data API adds
 * `condition` to its own check that the row exists, in the one conditional write. No earlier read
 * decides it, so a key revoked the moment it is made is still revoked, and nobody else's is.
 */
const REVOKE_AGENT_KEY = /* GraphQL */ `
  mutation RevokeAgentKey($hash: String!, $condition: ModelAgentKeyConditionInput!) {
    deleteAgentKey(input: { hash: $hash }, condition: $condition) {
      hash
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
  const {
    Appointment,
    Series,
    ActivityRecord,
    SubscriptionLink,
    AgentKey,
    Text,
    CalendarSettings,
    Reply,
    CalendarAlert,
    RepliesSeen,
  } = client.models;
  /** Each Appointment and Series as the core last read it here, until it is written. */
  const read = new Map<string, Appointment>();
  const readSeries = new Map<string, Series>();

  /** A write that carries a condition. Answers whether it was made: false when DynamoDB refused it. */
  async function writeIf(query: string, variables: Record<string, unknown>) {
    let answer: { errors?: readonly DataError[] };
    try {
      answer = (await client.graphql({ query, variables })) as { errors?: readonly DataError[] };
    } catch (thrown) {
      if (!(thrown && typeof thrown === 'object' && 'errors' in thrown)) throw thrown;
      answer = thrown as { errors?: readonly DataError[] };
    }
    if (!answer.errors?.length) return true;
    if (alreadyThere(answer.errors)) return false;
    throw new Error(answer.errors.map((e) => e.message).join('; '));
  }
  /** Replaces a row only if the condition holds as it is written. Answers whether it did. */
  const changeIf = (
    query: string,
    input: Record<string, unknown>,
    condition: { and: Record<string, unknown>[] },
  ) => writeIf(query, { input, condition });
  /** Creates a row only if none has its ID, in one step. Answers whether it did. */
  const created = (result: { errors?: readonly DataError[]; data: unknown }) => {
    if (alreadyThere(result.errors)) return false;
    check(result);
    return true;
  };

  /** Replaces a text's record only if the condition holds as it is written. Answers whether it did. */
  const changeTextIf = (next: Text, condition: { and: Record<string, unknown>[] }) =>
    writeIf(CHANGE_TEXT, { input: textRow(next), condition });

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
      return created(await Text.create(textRow(text)));
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
    async everyReply() {
      return (await everyRow<ReplyRow>((options) => Reply.list(options))).map(toReply);
    },
    async claimReply(reply) {
      return created(await Reply.create(replyRow(reply)));
    },
    // Only if no other run has changed it since it was read: answered it, or taken up its passing on.
    async changeReply(next, current) {
      return changeIf(CHANGE_REPLY, replyRow(next), {
        and: [
          { answer: { eq: current.answer } },
          { passOn: { eq: current.passOn.state } },
          ...(current.passOn.triedAt ? [{ passOnTriedAt: { eq: current.passOn.triedAt } }] : []),
        ],
      });
    },
    async everyCalendarAlert() {
      return (await everyRow<CalendarAlertRow>((options) => CalendarAlert.list(options))).map(
        toCalendarAlert,
      );
    },
    async claimCalendarAlert(alert) {
      return created(await CalendarAlert.create(calendarAlertRow(alert)));
    },
    async changeCalendarAlert(next, current) {
      return changeIf(CHANGE_CALENDAR_ALERT, calendarAlertRow(next), {
        and: [
          { state: { eq: current.progress.state } },
          ...(current.progress.triedAt ? [{ triedAt: { eq: current.progress.triedAt } }] : []),
        ],
      });
    },
    async repliesSeen(personId) {
      return check(await RepliesSeen.get({ personId }))?.seenUpTo ?? null;
    },
    // Never read and then written: the first mark is a create, which fails when another device
    // made one first, and any later one an update conditioned on the mark still being earlier, so
    // two devices marking at once can only move it on.
    async advanceRepliesSeen(personId, seenUpTo) {
      const row = { personId, seenUpTo };
      if (created(await RepliesSeen.create(row))) return;
      await changeIf(ADVANCE_REPLIES_SEEN, row, { and: [{ seenUpTo: { lt: seenUpTo } }] });
    },
    // The MCP server does not read through here: the data API's reads are not strongly consistent,
    // so it reads the table itself (agent-key-table.ts).
    async agentKeyByHash(hash) {
      const row = check(await AgentKey.get({ hash }));
      return row ? toAgentKey(row) : null;
    },
    async keepAgentKey(key) {
      check(await AgentKey.create(key));
    },
    async removeAgentKey(hash, personId) {
      return writeIf(REVOKE_AGENT_KEY, { hash, condition: { personId: { eq: personId } } });
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
