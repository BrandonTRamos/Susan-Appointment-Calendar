// The calendar core's store, kept in the data API and reached with the function's own role.
//
// Writing through the data API, not straight to the tables, is what sends every change to the
// people looking at the calendar (docs/adr/0003-the-core-writes-through-the-data-api.md).

import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { Appointment, Store, SubscriptionLink } from '../../src/lib/calendar';
import { toAppointment, type AppointmentRow } from '../../src/lib/calendarApi';
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
  };
}

function check<T>(result: { data: T; errors?: readonly { message: string }[] }): T {
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join('; '));
  return result.data;
}

/** Only the fields a subscription link has; the data API adds its own beside them. */
const toLink = ({ personId, hash, madeAt }: SubscriptionLink): SubscriptionLink => ({
  personId,
  hash,
  madeAt,
});

export function dataStore(client: DataClient): Store {
  const { Appointment, ActivityRecord, SubscriptionLink } = client.models;
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
    // Nothing sends texts yet. The ticket that does (11) answers this from the texts it records.
    async textSentAbout() {
      return false;
    },
    async recordActivity(record) {
      check(await ActivityRecord.create(record));
    },
    async everyAppointment() {
      const rows: AppointmentRow[] = [];
      let nextToken: string | null | undefined;
      do {
        const page = await Appointment.list({ limit: 1000, nextToken });
        rows.push(...check(page));
        nextToken = page.nextToken;
      } while (nextToken);
      return rows.map(toAppointment);
    },
    async subscriptionLinkOf(personId) {
      const row = check(await SubscriptionLink.get({ personId }));
      return row ? toLink(row) : null;
    },
    // Found through an index, which can lag a moment behind a link being switched off or replaced,
    // so the person's link is read again to be sure it is still this one.
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

/** The store for a backend function that the data schema lets call the data API. */
export async function createDataStore(env: NodeJS.ProcessEnv = process.env): Promise<Store> {
  // The Lambda runtime sets the AWS credentials and AMPLIFY_DATA_* variables this reads.
  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(
    env as Parameters<typeof getAmplifyDataClientConfig>[0],
  );
  Amplify.configure(resourceConfig, libraryOptions);
  return dataStore(generateClient<Schema>());
}
