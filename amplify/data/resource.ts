import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import {
  ACTIVITY_ACTIONS,
  ALERT_STATES,
  APPOINTMENT_STATES,
  REMINDER_SHAPES,
  REMINDER_UNITS,
  REPEAT_KINDS,
  TEXT_KINDS,
  TEXT_REASONS,
  TEXT_STATUSES,
} from '../../src/lib/calendar';
import { appNotifications } from '../functions/app-notifications/resource';
import { calendarCommands } from '../functions/calendar-commands/resource';
import { mcpServer } from '../functions/mcp-server/resource';
import { sendTexts } from '../functions/send-texts/resource';
import { seriesTopUp } from '../functions/series-top-up/resource';

// Calendar data, and the only way to change it.
//
// Anyone signed in can read the calendar, with live updates, its Series, and their own subscription
// link and agent keys; nobody signed in can write a model directly. Writing goes through the calendar core (src/lib/calendar),
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

    // How a Series repeats (Repeat in src/lib/calendar/series.ts): every `interval` weeks on
    // `weekdays` (0 is Monday), or every `interval` months on `day`.
    Repeat: a.customType({
      every: a.enum(REPEAT_KINDS),
      interval: a.integer().required(),
      weekdays: a.integer().array(),
      day: a.integer(),
    }),

    // Where an Appointment stands in its Series (SeriesPlace in src/lib/calendar/series.ts).
    SeriesPlace: a.customType({
      id: a.id().required(),
      date: a.date().required(),
      repeat: a.ref('Repeat').required(),
      individuallyChanged: a.boolean().required(),
      // The Series' time, 'HH:MM', when the clocks skipped it that night and moved it on.
      shiftedFrom: a.string(),
    }),

    // A Reminder on a Series: a Reminder's timing, never an exact time (SeriesReminder in
    // src/lib/calendar/series.ts).
    SeriesReminder: a.customType({
      shape: a.enum(REMINDER_SHAPES),
      amount: a.integer(),
      unit: a.enum(REMINDER_UNITS),
      days: a.integer(),
      time: a.string(), // 'HH:MM'
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
        series: a.ref('SeriesPlace'),
        added: a.ref('Stamp').required(),
        lastChanged: a.ref('Stamp'),
      })
      .authorization((allow) => [allow.authenticated().to(['read'])]),

    // A Series: the details, pattern and Reminders its Appointments start with (Series in
    // src/lib/calendar/series.ts). Its Appointments are real Appointments, each pointing at it.
    Series: a
      .model({
        what: a.string().required(),
        time: a.string().required(), // 'HH:MM'
        withWhom: a.string(),
        placeName: a.string(),
        placeAddress: a.string(),
        driverName: a.string(),
        pickupTime: a.string(), // 'HH:MM'
        noteForSusan: a.string(),
        privateNotes: a.string(),
        repeat: a.ref('Repeat').required(),
        starts: a.date().required(),
        ends: a.date(),
        reminders: a.ref('SeriesReminder').array(),
        madeThrough: a.date().required(),
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
        // Set for a command on a whole Series.
        seriesId: a.id(),
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

    // What a text told Susan of its Appointment (Told in src/lib/calendar/texts.ts): its date and
    // time, Susan's local time, and whether it said it is cancelled.
    Told: a.customType({
      date: a.date().required(),
      time: a.string().required(), // 'HH:MM'
      cancelled: a.boolean().required(),
    }),

    // Each person's agent keys (AgentKey in src/lib/calendar/agentKeys.ts), for their AI agent to use
    // the MCP server as them: a hash of each, never the key itself, which is also how the person
    // names one to revoke it. A signed-in person can read only their own, and nobody signed in can
    // write one directly. A key is revoked by a delete on condition that it is the person's, which
    // DynamoDB checks as it deletes (amplify/calendar/data-store.ts). The MCP server reads this table itself, by the hash, with a strongly
    // consistent read (amplify/calendar/agent-key-table.ts), so that a revoked key stops at once.
    AgentKey: a
      .model({
        hash: a.string().required(),
        personId: a.string().required(),
        name: a.string().required(),
        madeAt: a.datetime().required(),
      })
      .identifier(['hash'])
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
        creditLeft: a.integer(),
        // The Alert about it (TextAlert in src/lib/calendar/texts.ts), flat so that a write can be
        // conditioned on it: its state, how many times a run took it up and when it last did,
        // each delivery known to have gone, and each refused for good. Missing on a text recorded before ticket 15, which
        // raises none.
        alert: a.enum(ALERT_STATES),
        alertTries: a.integer(),
        alertTriedAt: a.datetime(),
        alertSent: a.string().array(),
        alertRefused: a.string().array(),
        // What it told her, from which Change notices are worked out. Missing on a test text, and
        // on a text recorded before ticket 14.
        told: a.ref('Told'),
      })
      .secondaryIndexes((index) => [index('appointmentId').queryField('textsByAppointment')])
      .authorization((allow) => [allow.authenticated().to(['read'])]),
    // Where texts go and who Susan is told to call (CalendarSettings in
    // src/lib/calendar/texts.ts): one row, with the ID SETTINGS_ID in src/lib/calendarApi.ts.
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
    // A Series: added with its ID, chosen by the app; changed or ended from the Appointment `id` on.
    addSeries: command().arguments({ id: a.id(), details: a.json().required() }),
    changeSeries: command().arguments({ id: a.id().required(), changes: a.json().required() }),
    endSeries: command().arguments({ id: a.id().required() }),
    // Each answers with a CommandAnswer: the new link's secret, shown this once, or null.
    makeSubscriptionLink: command(),
    switchOffSubscriptionLink: command(),
    // Answers with a CommandAnswer: the new key, shown this once, or null once one is revoked. A key
    // is named by its hash to revoke it.
    makeAgentKey: command().arguments({ name: a.string().required() }),
    revokeAgentKey: command().arguments({ hash: a.string().required() }),
    // Each answers with a CommandAnswer: the settings as they now are, or the test text's record.
    changeSettings: command().arguments({ settings: a.json().required() }),
    sendTestText: command(),
    // Which text sender the backend uses, TextSenderName in amplify/calendar/text-sender.ts:
    // 'textbelt', or 'stand-in' while no Textbelt key is stored. Settings says when texts are only
    // being recorded. Answered at the time asked, since the key is a secret stored after a deploy.
    textSender: a
      .query()
      .returns(a.string())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(calendarCommands)),

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
    // Keeps this device against the signed-in person's account, or forgets it. Turning them on is
    // the only way a device changes hands.
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
    // Keeps this device up to date when the app opens, only if it is the signed-in person's. Answers
    // with what became of it (DeviceRenewal in src/lib/appNotifications.ts).
    renewAppNotifications: a
      .mutation()
      .arguments({
        endpoint: a.string().required(),
        p256dh: a.string().required(),
        auth: a.string().required(),
        label: a.string(),
      })
      .returns(a.string())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(appNotifications)),
    // Answers with what became of it (DeviceRemoval in src/lib/appNotifications.ts): forgotten, not
    // kept, kept for someone else and so left with them, or unconfirmed.
    turnOffAppNotifications: a
      .mutation()
      .arguments({ endpoint: a.string().required() })
      .returns(a.string())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(appNotifications)),
  })
  // Lets the functions that run the core write through the data API, so that every change reaches
  // everyone looking at the calendar (docs/adr/0003-the-core-writes-through-the-data-api.md). The
  // scheduled run sends texts through it; the Series top-up, the app-notifications function and the
  // MCP server are narrowed to their own operations (amplify/backend.ts).
  .authorization((allow) => [
    allow.resource(calendarCommands).to(['query', 'mutate']),
    allow.resource(mcpServer).to(['query', 'mutate']),
    allow.resource(seriesTopUp).to(['query', 'mutate']),
    allow.resource(appNotifications).to(['query', 'mutate']),
    allow.resource(sendTexts).to(['query', 'mutate']),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
