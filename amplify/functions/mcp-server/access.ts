// Every data API field the MCP server may call, and nothing else: `amplify/backend.ts` narrows its
// role to these, `npm run synth` checks the role against this list, and a test carries out what
// every tool does over a data API that refuses any other field (amplify/calendar/data-store.test.ts),
// so the list is what its code calls.
//
// Its tools read and change Appointments and Series through the calendar core, which records each
// change and reads the texts about an Appointment before it deletes or withdraws one. Its Admin
// messenger finds the devices Activity updates go to, the key that signs them, and forgets a device
// whose subscription is gone. It finds agent keys in their own table, not here, and it reads and
// writes no settings, subscription link or agent key, and writes no text.

export const MCP_SERVER_FIELDS = {
  Query: [
    'getAppointment',
    'listAppointments',
    'getSeries',
    'listSeries',
    'textsByAppointment',
    'listAppNotificationDevices',
    'getAppNotificationKey',
  ],
  Mutation: [
    'createAppointment',
    'updateAppointment',
    'deleteAppointment',
    'createSeries',
    'updateSeries',
    'createActivityRecord',
    'deleteAppNotificationDevice',
  ],
};
