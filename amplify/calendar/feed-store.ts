// What the subscription feed reads, straight from the tables with strongly consistent reads.
//
// The data API's own reads are eventually consistent: AppSync reads DynamoDB without
// ConsistentRead unless a resolver asks for it, and Amplify's resolvers never do. A feed read that
// way could keep serving a link for a moment after it was switched off, or miss a change made just
// before a calendar app's refresh. So the feed reads the tables itself. The core still writes only
// through the data API (docs/adr/0003-the-core-writes-through-the-data-api.md), and this store
// writes nothing.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Store, SubscriptionLink } from '../../src/lib/calendar';
import { toAppointment, type AppointmentRow } from '../../src/lib/calendarApi';

/** The index on SubscriptionLink's hash (amplify/data/resource.ts), as Amplify names it. */
export const LINK_INDEX = 'subscriptionLinksByHash';

/** The part of the DynamoDB document client the store uses. */
export interface TableReader {
  send(command: GetCommand | QueryCommand | ScanCommand): Promise<Record<string, unknown>>;
}

export interface FeedTables {
  appointments: string;
  links: string;
}

const toLink = ({ personId, hash, madeAt }: SubscriptionLink): SubscriptionLink => ({
  personId,
  hash,
  madeAt,
});

function readOnly(): never {
  throw new Error('The subscription feed only reads the calendar.');
}

export function feedStore(reader: TableReader, tables: FeedTables): Store {
  /** The person's link as the table holds it now. */
  async function linkOf(personId: string): Promise<SubscriptionLink | null> {
    const { Item } = await reader.send(
      new GetCommand({ TableName: tables.links, Key: { personId }, ConsistentRead: true }),
    );
    return Item ? toLink(Item as unknown as SubscriptionLink) : null;
  }

  return {
    async appointment(id) {
      const { Item } = await reader.send(
        new GetCommand({ TableName: tables.appointments, Key: { id }, ConsistentRead: true }),
      );
      return Item ? toAppointment(Item as unknown as AppointmentRow) : null;
    },
    async everyAppointment() {
      const rows: AppointmentRow[] = [];
      let start: Record<string, unknown> | undefined;
      do {
        const page = await reader.send(
          new ScanCommand({
            TableName: tables.appointments,
            ConsistentRead: true,
            ExclusiveStartKey: start,
          }),
        );
        rows.push(...((page.Items ?? []) as AppointmentRow[]));
        start = page.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (start);
      return rows.map(toAppointment);
    },
    subscriptionLinkOf: linkOf,
    // An index cannot be read consistently, and it can lag a moment behind a link being switched
    // off or replaced. So the link it finds is read again from the table, consistently, and served
    // only if the person's link is still this one.
    async subscriptionLinkByHash(hash) {
      const { Items } = await reader.send(
        new QueryCommand({
          TableName: tables.links,
          IndexName: LINK_INDEX,
          KeyConditionExpression: '#hash = :hash',
          ExpressionAttributeNames: { '#hash': 'hash' },
          ExpressionAttributeValues: { ':hash': hash },
          Limit: 1,
        }),
      );
      const found = (Items as SubscriptionLink[] | undefined)?.[0];
      if (!found) return null;
      const now = await linkOf(found.personId);
      return now && now.hash === hash ? now : null;
    },
    // Nothing sends texts yet; the feed never asks.
    textSentAbout: async () => false,
    addAppointment: async () => readOnly(),
    replaceAppointment: async () => readOnly(),
    removeAppointment: async () => readOnly(),
    recordActivity: async () => readOnly(),
    keepSubscriptionLink: async () => readOnly(),
    removeSubscriptionLink: async () => readOnly(),
  };
}

/** The store for the feed function, over the tables named in its environment (amplify/backend.ts). */
export function createFeedStore(env: NodeJS.ProcessEnv = process.env): Store {
  const appointments = env.APPOINTMENT_TABLE;
  const links = env.SUBSCRIPTION_LINK_TABLE;
  if (!appointments || !links) throw new Error('The feed has not been told its tables.');
  return feedStore(DynamoDBDocumentClient.from(new DynamoDBClient({})), { appointments, links });
}
