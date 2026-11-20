import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import { ACTIVITY_ACTIONS, APPOINTMENT_STATES } from '../../src/lib/calendar';
import { calendarCommands } from '../functions/calendar-commands/resource';

// Calendar data, and the only way to change it.
//
// Anyone signed in can read everything, with live updates, and nobody signed in can write a model
// directly. Writing goes through the calendar core (src/lib/calendar), whose commands are the
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
  })
  // Lets the function write through the data API, so that every change reaches everyone looking at
  // the calendar (docs/adr/0003-the-core-writes-through-the-data-api.md).
  .authorization((allow) => [allow.resource(calendarCommands).to(['query', 'mutate'])]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
