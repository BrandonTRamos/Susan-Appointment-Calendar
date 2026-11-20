// Every data API field the Series top-up may call, and nothing else: `amplify/backend.ts` narrows
// its role to these, `npm run synth` checks the role against this list, and a test runs the top-up
// over a data API that refuses any other field (amplify/calendar/data-store.test.ts), so the list
// is exactly what its code calls.
//
// It reads every Series and the Appointments, adds the Appointments a Series still needs, and
// notes how far each is made. When a Series was ended or split while it ran, it takes out again
// what it made past the end, as every command does (withdraw in src/lib/calendar/core.ts): it
// reads the texts about each of those Appointments, and removes one only when Susan cannot have
// been texted about it, and otherwise cancels it. So it may delete and update an Appointment, but
// it may not record activity, and it reads no other text and changes none.

export const SERIES_TOP_UP_FIELDS = {
  Query: ['getAppointment', 'listAppointments', 'getSeries', 'listSeries', 'textsByAppointment'],
  Mutation: ['createAppointment', 'updateAppointment', 'deleteAppointment', 'updateSeries'],
};
