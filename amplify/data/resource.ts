import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import { ACTIVITY_ACTIONS, APPOINTMENT_STATES } from '../../src/lib/calendar';
import { appNotifications } from '../functions/app-notifications/resource';
import { calendarCommands } from '../functions/calendar-commands/resource';

// Calendar data, and the only way to change it.
//
// Anyone signed in can read the calendar, with live updates, and their own subscription link; nobody
// signed in can write a model directly. Writing goes through the calendar core (src/lib/calendar),
// whose commands are the mutations at the end. `npm run synth` checks that those, and turning app
// notifications on and off for a device, are the only mutations a signed-in person can call
// (scripts/synth.mjs).

/** Every command runs in the calendar-commands function, for anyone signed in. */
const command = () =>
  a
    .mutation()
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(calendarCommands));

const schema = a
  .schema({
    // Who did something, and when (Stamp in src/lib/calendar/appointment.ts).
    Stamp: a.customType({
      personId: a.string().required(),
      personName: a.string().required(),
      viaAgent: a.boolean().required(),
      at: a.datetime().required(),
    }),

    // What each field means is in src/lib/calendar/appointment.ts. The date and both times are
    // Susan's local time; `startsAt` is the moment that is.
    Appointment: a
      .model({
        what: a.string().required(),
        date: a.date().required(),
        time: a.string().required(), // 'HH:MM'
        startsAt: a.datetime().required(),
        withWhom: a.string(),
        placeName: a.string(),
        placeAddress: a.string(),
        driverName: a.string(),
        pickupTime: a.string(), // 'HH:MM'
        noteForSusan: a.string(),
        privateNotes: a.string(),
        state: a.enum(APPOINTMENT_STATES),
        added: a.ref('Stamp').required(),
        lastChanged: a.ref('Stamp'),
      })
      .authorization((allow) => [allow.authenticated().to(['read'])]),

    // One per command: who did what to which Appointment (ActivityRecord in
    // src/lib/calendar/appointment.ts). It outlives the Appointment it is about.
    ActivityRecord: a
      .model({
        at: a.datetime().required(),
        personId: a.string().required(),
        personName: a.string().required(),
        viaAgent: a.boolean().required(),
        action: a.enum(ACTIVITY_ACTIONS),
        appointmentId: a.id().required(),
        what: a.string().required(),
        date: a.date().required(),
        time: a.string().required(),
      })
      .authorization((allow) => [allow.authenticated().to(['read'])]),

    // Each person's calendar subscription link (SubscriptionLink in
    // src/lib/calendar/subscription.ts): a hash of it, never the link itself. A signed-in person can
    // read only their own, and nobody signed in can write one directly. The feed reads this table
    // itself, finding a link through the hash index (amplify/calendar/feed-store.ts).
    SubscriptionLink: a
      .model({
        personId: a.string().required(),
        hash: a.string().required(),
        madeAt: a.datetime().required(),
      })
      .identifier(['personId'])
      .secondaryIndexes((index) => [index('hash').queryField('subscriptionLinkByHash')])
      .authorization((allow) => [
        allow.ownerDefinedIn('personId').identityClaim('sub').to(['read']),
      ]),

    // The core's commands. Each answers with a CommandAnswer (src/lib/calendarApi.ts): the
    // Appointment as it now is, or the core's refusal. `removeAppointment` is the core's "delete":
    // the name deleteAppointment belongs to the model's own mutation, which only the function may
    // call.
    // The app gives a new Appointment its ID, so that an add sent twice is carried out once.
    addAppointment: command().arguments({ id: a.id(), details: a.json().required() }),
    changeAppointment: command().arguments({
      id: a.id().required(),
      changes: a.json().required(),
    }),
    cancelAppointment: command().arguments({ id: a.id().required() }),
    removeAppointment: command().arguments({ id: a.id().required() }),
    // Each answers with a CommandAnswer: the new link's secret, shown this once, or null.
    makeSubscriptionLink: command(),
    switchOffSubscriptionLink: command(),

    // App notifications (src/lib/appNotifications.ts). Each device someone turned them on for, kept
    // against their account: the ID is the SHA-256 of its push endpoint. The calendar-commands
    // function sends to these and forgets one whose subscription is gone. Nobody signed in can read
    // or write them: they go through the operations below, run by the app-notifications function.
    AppNotificationDevice: a
      .model({
        personId: a.string().required(),
        endpoint: a.string().required(),
        p256dh: a.string().required(),
        auth: a.string().required(),
        label: a.string(), // "iPhone"
      })
      .authorization((allow) => [allow.authenticated().to([])]),
    // The key pair that signs app notifications (src/lib/vapid.ts): one row, ID "vapid", made the
    // first time anyone turns notifications on. The private half never leaves the backend.
    AppNotificationKey: a
      .model({
        publicKey: a.string().required(),
        privateKey: a.string().required(),
      })
      .authorization((allow) => [allow.authenticated().to([])]),

    // The public key a device subscribes with, made on first use.
    appNotificationKey: a
      .query()
      .returns(a.string())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(appNotifications)),
    // Keeps this device against the signed-in person's account, or forgets it.
    turnOnAppNotifications: a
      .mutation()
      .arguments({
        endpoint: a.string().required(),
        p256dh: a.string().required(),
        auth: a.string().required(),
        label: a.string(),
      })
      .returns(a.boolean())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(appNotifications)),
    turnOffAppNotifications: a
      .mutation()
      .arguments({ endpoint: a.string().required() })
      .returns(a.boolean())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(appNotifications)),
  })
  // Lets the functions write through the data API, so that every change reaches everyone looking at
  // the calendar (docs/adr/0003-the-core-writes-through-the-data-api.md).
  .authorization((allow) => [
    allow.resource(calendarCommands).to(['query', 'mutate']),
    allow.resource(appNotifications).to(['query', 'mutate']),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
