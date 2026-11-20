import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import {
  ACTIVITY_ACTIONS,
  APPOINTMENT_STATES,
  REMINDER_SHAPES,
  REMINDER_UNITS,
  TEXT_KINDS,
  TEXT_REASONS,
  TEXT_STATUSES,
} from '../../src/lib/calendar';
import { calendarCommands } from '../functions/calendar-commands/resource';
import { sendTexts } from '../functions/send-texts/resource';

// Calendar data, and the only way to change it.
//
// Anyone signed in can read the calendar, with live updates, and their own subscription link; nobody
// signed in can write a model directly. Writing goes through the calendar core (src/lib/calendar), whose commands are the
// mutations at the end. `npm run synth` checks that those are the only mutations a signed-in
// person can call (scripts/synth.mjs).

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

    // One Reminder on an Appointment (Reminder in src/lib/calendar/appointment.ts). Its timing has
    // one of three shapes, and only the fields of its shape are set: `amount` and `unit` for a gap
    // before the start, `days` and `time` for days before at a clock time, `date` and `time` for an
    // exact time.
    Reminder: a.customType({
      id: a.string().required(),
      shape: a.enum(REMINDER_SHAPES),
      amount: a.integer(),
      unit: a.enum(REMINDER_UNITS),
      days: a.integer(),
      date: a.date(),
      time: a.string(), // 'HH:MM'
      dueAt: a.datetime().required(),
      needsReview: a.boolean().required(),
      // When its time was last worked out. Missing on a Reminder kept before ticket 11.
      setAt: a.datetime(),
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
        reminders: a.ref('Reminder').array(),
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

    // The record of each text to Susan (Text in src/lib/calendar/texts.ts). Its ID is made from
    // what it is about and when it was due; creating one fails when one with that ID exists, which
    // is how a text is claimed before it is sent (`npm run synth` checks it).
    Text: a
      .model({
        kind: a.enum(TEXT_KINDS),
        appointmentId: a.id(),
        reminderId: a.string(),
        words: a.string().required(),
        dueAt: a.datetime().required(),
        status: a.enum(TEXT_STATUSES),
        reason: a.enum(TEXT_REASONS),
        attempts: a.integer().required(),
        triedAt: a.datetime().required(),
        sentAt: a.datetime(),
        reference: a.string(),
      })
      .secondaryIndexes((index) => [index('appointmentId').queryField('textsByAppointment')])
      .authorization((allow) => [allow.authenticated().to(['read'])]),
    // Where texts go and who Susan is told to call (CalendarSettings in
    // src/lib/calendar/texts.ts): one row, with the ID SETTINGS_ID in amplify/calendar/data-store.ts.
    CalendarSettings: a
      .model({
        susansNumber: a.string(),
        contactName: a.string(),
        contactPhone: a.string(),
        lastChanged: a.ref('Stamp'),
      })
      .authorization((allow) => [allow.authenticated().to(['read'])]),
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
    // Each answers with a CommandAnswer: the settings as they now are, or the test text's record.
    changeSettings: command().arguments({ settings: a.json().required() }),
    sendTestText: command(),
  })
  // Lets the commands function and the scheduled run write through the data API, so that every
  // change reaches everyone looking at the calendar
  // (docs/adr/0003-the-core-writes-through-the-data-api.md).
  .authorization((allow) => [
    allow.resource(calendarCommands).to(['query', 'mutate']),
    allow.resource(sendTexts).to(['query', 'mutate']),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
